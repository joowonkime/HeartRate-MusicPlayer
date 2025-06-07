import { onMount, tick } from "svelte";
import { rtdb } from "./lib/firebase";
import { ref as dbRef, onValue, get as dbGet, set } from "firebase/database";
import { searchYoutubeVideo } from "./lib/youtube-api";
import { auth } from "./lib/firebase";
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { writable, type Writable, get } from "svelte/store";

// --- 1) 화면에 표시할 변수 선언 -------------------------------------
export const currentBpm: Writable<number | null> = writable(null);
export const lastUpdated: Writable<number | null> = writable(null);
export const queryText = writable("");

// Track BPM used for last recommendation generation for threshold-based updates
let lastRecommendationBpm: number | null = null;
const BPM_UPDATE_THRESHOLD = 20; // Only update playlist if BPM changes by >20

export interface TrackInfo {
  name: string;
  artist: string;
}

export const foundTrack: Writable<TrackInfo | null> = writable(null);
export const player: Writable<any> = writable(null);
export const playerReady = writable(false);
export const playlist: Writable<string[]> = writable([]);
export const currentIndex = writable(0);
export const currentVideoId: Writable<string | null> = writable(null);

// Progress tracking variables
export const songProgress = writable(0); // 0-100 percentage
export const songDuration = writable(0);
export const songCurrentTime = writable(0);
export const isPlaying = writable(false); // Track playing state

// Store the progress interval for cleanup
let progressInterval: ReturnType<typeof setInterval> | null = null;

// Reset progress state
function resetProgressState() {
  songProgress.set(0);
  songDuration.set(0);
  songCurrentTime.set(0);
  isPlaying.set(false);
  
  // Clear any existing progress interval
  if (progressInterval !== null) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
}

export interface AudioFeature {
  track_id: string;
  track_name: string;
  acousticness: number;
  artist_name: string;
  danceability: number;
  duration_ms: number;
  energy: number;
  instrumentalness: number;
  key: number;
  liveness: number;
  loudness: number;
  mode: number;
  popularity: number;
  speechiness: number;
  tempo: number;
  time_signature: number;
  valence: number;
}

export const allAudioFeatures: Writable<Record<string, AudioFeature> | null> = writable(null);
export const baseFeatures: Writable<AudioFeature | null> = writable(null);

export type Recommendation = {
  key: string;
  track_name: string;
  artist_name: string;
  videoId: string | null;
  index: number;
};

export const recommendations: Writable<Recommendation[]> = writable([]);

// "중복 검색 결과"를 담을 배열
export const ambiguousMatches: Writable<{ key: string; track_name: string; artist_name: string }[]> = writable([]);

// 사용자 입력(가중치) 예시
export const userInputAssumption = writable({
  danceability: 0.5,
  energy: 0.5,
  instrumentalness: 0.5,
  liveness: 0.5,
  valence: 0.5
});

export const isSearching = writable(false);
export const errorMessage: Writable<string | null> = writable(null);
export const showLaunchScreen = writable(true);
export const showWelcomePage = writable(false);
export const showSignInPage = writable(false);
export const showPreferencesPage = writable(false);
export const showInstructionPage = writable(false);
export const showSensorPage = writable(false);
export const showHomePage = writable(false);
export const user: Writable<any> = writable(null);

// User preferences
export const userPreferences = writable({
  energy: 0.5, // 0-1 scale
  popularity: 'hidden-gems' as 'chart-toppers' | 'hidden-gems', // 'chart-toppers' or 'hidden-gems'
  danceability: 3, // 1-5 scale
  speechiness: 3 // 1-5 scale
});

// Demo mode state
export const isDemoMode = writable(false);
export const demoWorkoutActive = writable(false); // Track if workout simulation is running

let demoWorkoutInterval: ReturnType<typeof setInterval> | null = null;

// Initialize the app
export function initializeApp() {
  console.log("App mounted, checking initial auth state...");
  console.log("Current user on mount:", auth.currentUser);
  
  const timer = setTimeout(() => {
    showLaunchScreen.set(false);
    showWelcomePage.set(true);
  }, 3000);

  // Firebase Auth state listener
  onAuthStateChanged(auth, async (authUser) => {
    console.log("Auth state changed:", authUser ? "User signed in" : "User signed out");
    user.set(authUser);
    if (authUser) {
      console.log("Checking user preferences for:", authUser.uid);
      // Check if user has preferences saved
      const hasPreferences = await checkUserPreferences(authUser.uid);
      console.log("Has preferences:", hasPreferences);
      
      if (hasPreferences) {
        // Existing user - go to instruction page first
        console.log("Existing user - navigating to instruction page");
        showSignInPage.set(false);
        showWelcomePage.set(false);
        showPreferencesPage.set(false);
        showHomePage.set(false);
        showInstructionPage.set(true);
      } else {
        // First-time user - show preferences page
        console.log("New user - navigating to preferences page");
        showSignInPage.set(false);
        showWelcomePage.set(false);
        showPreferencesPage.set(true);
      }
    }
  });

  // --- 2) Firebase real-time data setup & YouTube IFrame API 로드 ----
  (async () => {
    // 심박수 subscribe
    const bpmRef = dbRef(rtdb, "heart_rate/current_bpm");
    onValue(bpmRef, (snapshot) => {
      const val = snapshot.val();
      const newBpm = val !== null ? Number(val) : null;
      currentBpm.set(newBpm);
      
      // Check for threshold-based playlist updates
      if (newBpm !== null) {
        checkAndUpdatePlaylistForBPM(newBpm);
      }
    });
    const updatedRef = dbRef(rtdb, "heart_rate/last_updated");
    onValue(updatedRef, (snapshot) => {
      const val = snapshot.val();
      lastUpdated.set(val !== null ? Number(val) : null);
    });

    // database audiofeatures load
    try {
      const snap = await dbGet(dbRef(rtdb, "audioFeatures"));
      allAudioFeatures.set(snap.val() as Record<string, AudioFeature>);
    } catch (e) {
      console.error("DB에서 전체 오디오 피처를 가져오는 중 오류:", e);
    }
  })();

  // YouTube IFrame API setup
  function markPlayerReady() {
    playerReady.set(true);
  }

  // 이미 YT 스크립트가 로드되어 있으면 즉시 ready 처리
  if ((window as any).YT && (window as any).YT.Player) {
    markPlayerReady();
  } else {
    // 동적으로 API 스크립트 삽입
    if (!document.getElementById("youtube-iframe-api")) {
      const tag = document.createElement("script");
      tag.id = "youtube-iframe-api";
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }
    // API가 로드된 후 호출될 콜백 등록
    (window as any).onYouTubeIframeAPIReady = markPlayerReady;
  }

  return () => clearTimeout(timer);
}

export async function checkUserPreferences(userId: string): Promise<boolean> {
  try {
    console.log("Checking preferences for user ID:", userId);
    const snapshot = await dbGet(dbRef(rtdb, `users/${userId}/preferences`));
    const exists = snapshot.exists();
    console.log("Preferences exist:", exists);
    if (exists) {
      console.log("User preferences data:", snapshot.val());
    }
    return exists;
  } catch (error) {
    console.error("Error checking user preferences:", error);
    return false;
  }
}

export async function saveUserPreferences() {
  const $user = get(user);
  const $userPreferences = get(userPreferences);
  const $userInputAssumption = get(userInputAssumption);
  
  if (!$user) return;
  
  // Map UI preferences to algorithmic preferences
  $userInputAssumption.energy = $userPreferences.energy;
  $userInputAssumption.danceability = $userPreferences.danceability / 5; // Convert 1-5 to 0-1
  $userInputAssumption.valence = $userPreferences.popularity === 'chart-toppers' ? 0.7 : 0.3;
  $userInputAssumption.instrumentalness = (6 - $userPreferences.speechiness) / 5; // Inverse relationship
  
  userInputAssumption.set($userInputAssumption);
  
  try {
    await set(dbRef(rtdb, `users/${$user.uid}/preferences`), $userPreferences);
    await set(dbRef(rtdb, `users/${$user.uid}/createdAt`), Date.now());
    
    // Navigate to instruction page
    showPreferencesPage.set(false);
    showInstructionPage.set(true);
  } catch (error) {
    console.error("Error saving preferences:", error);
  }
}

/*
거리계산(가중치 포함)
(1) 곡 간 거리(baseDist)
(2) 사용자 선호 거리(prefDist)
(3) 가중치 w_pref
(4) 이 필드에 대한 최종 거리 기여(fDist)

(1) 심박수와 tempo 간 거리(bpmComponent)

저 두개 유클리안 distance로 구함함
*/
export function hybridDistance(
  candidate: AudioFeature,
  base: AudioFeature,
  userPref: {
    danceability: number;
    energy: number;
    instrumentalness: number;
    liveness: number;
    valence: number;
  }
): number {
  const audioFields: Array<keyof AudioFeature> = [
    "danceability",
    "energy",
    "instrumentalness",
    "liveness",
    "valence"
  ];

  let sumSq = 0;

  for (const f of audioFields) {
    const aVal = candidate[f] as number;
    const bVal = base[f] as number;
    
    const prefVal = userPref[f] as number;
    const baseDist = Math.abs(aVal - bVal);
    const prefDist = Math.abs(aVal - prefVal);
    const w_pref = 2 * Math.abs(prefVal - 0.5);
    const fDist = baseDist + w_pref * prefDist;

    sumSq += fDist * fDist;
  }
  
  let bpmComponent = 0;
  const $currentBpm = get(currentBpm);
  if ($currentBpm) {
    const w_bpm = Math.min($currentBpm / 200, 1);
    const tempoVal = candidate.tempo;
    const bpmDiff = Math.abs(tempoVal - $currentBpm);
    const weightedBpmDiff = w_bpm * bpmDiff;
    bpmComponent = weightedBpmDiff * weightedBpmDiff;
  }

  return Math.sqrt(sumSq + bpmComponent);
}

// 추천음악생성성
export async function buildRecommendations(
  baseKey: string,
  limit: number
): Promise<Recommendation[]> {
  const $allAudioFeatures = get(allAudioFeatures);
  const $userInputAssumption = get(userInputAssumption);
  
  if (!$allAudioFeatures) {
    throw new Error("전체 AudioFeatures 데이터가 아직 로드되지 않았습니다.");
  }
  const baseFeat = $allAudioFeatures[baseKey];
  if (!baseFeat) {
    throw new Error("DB에서 원곡을 찾을 수 없습니다.");
  }

  const distances: { key: string; dist: number }[] = [];
  for (const key in $allAudioFeatures) {
    if (key === baseKey) continue;
    const feat = $allAudioFeatures[key];
    if (feat.duration_ms <= 75000 || feat.track_name.includes("The Wheels on the Bus"))
      continue;
    const d = hybridDistance(feat, baseFeat, $userInputAssumption);
    distances.push({ key, dist: d });
  }
  distances.sort((a, b) => a.dist - b.dist);

  const top = distances.slice(0, limit);
  const recs: Recommendation[] = [];
  for (let i = 0; i < top.length; i++) {
    const key = top[i].key;
    const feat = $allAudioFeatures[key];
    recs.push({
      key,
      track_name: feat.track_name,
      artist_name: feat.artist_name,
      videoId: null,
      index: i + 1
    });
  }
  return recs;
}

// 연속적인 재생목록 생성방법법
export async function getMoreRecommendations(
  baseKey: string,
  excludeSet: Set<string>,
  count: number
): Promise<Recommendation[]> {
  const $allAudioFeatures = get(allAudioFeatures);
  const $userInputAssumption = get(userInputAssumption);
  
  if (!$allAudioFeatures) {
    throw new Error("전체 AudioFeatures 데이터가 아직 로드되지 않았습니다.");
  }
  const baseFeat = $allAudioFeatures[baseKey];
  if (!baseFeat) {
    throw new Error("DB에서 기준 곡을 찾을 수 없습니다.");
  }

  const distances: { key: string; dist: number }[] = [];
  for (const key in $allAudioFeatures) {
    if (excludeSet.has(key)) continue;
    const feat = $allAudioFeatures[key];
    if (feat.duration_ms <= 75000) continue;
    const d = hybridDistance(feat, baseFeat, $userInputAssumption);
    distances.push({ key, dist: d });
  }
  distances.sort((a, b) => a.dist - b.dist);

  const top = distances.slice(0, count);
  const recs: Recommendation[] = [];
  for (let i = 0; i < top.length; i++) {
    const key = top[i].key;
    const feat = $allAudioFeatures[key];
    recs.push({
      key,
      track_name: feat.track_name,
      artist_name: feat.artist_name,
      videoId: null,
      index: -1
    });
  }
  return recs;
}

export function continueToApp() {
  showWelcomePage.set(false);
  showSignInPage.set(true);
}

export function goBackFromSignIn() {
  showSignInPage.set(false);
  showWelcomePage.set(true);
}

export function goBackFromPreferences() {
  showPreferencesPage.set(false);
  showSignInPage.set(true);
}

export function goBackFromInstructions() {
  showInstructionPage.set(false);
  showPreferencesPage.set(true);
}

export function continueFromInstructions() {
  showInstructionPage.set(false);
  showSensorPage.set(true);
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    console.log("User signed in:", result.user);
  } catch (error) {
    console.error("Error signing in:", error);
  }
}

export async function signOutUser() {
  try {
    await signOut(auth);
    console.log("User signed out");
    showLaunchScreen.set(false);
    showWelcomePage.set(true);
    showSignInPage.set(false);
    showPreferencesPage.set(false);
    showInstructionPage.set(false);
    showSensorPage.set(false);
    showHomePage.set(false);
    user.set(null);
  } catch (error) {
    console.error("Error signing out:", error);
  }
}

export function updateEnergyLevel(event: Event) {
  const target = event.target as HTMLInputElement;
  const $userPreferences = get(userPreferences);
  $userPreferences.energy = parseFloat(target.value);
  userPreferences.set($userPreferences);
}

export function selectPopularity(type: 'chart-toppers' | 'hidden-gems') {
  const $userPreferences = get(userPreferences);
  $userPreferences.popularity = type;
  userPreferences.set($userPreferences);
}

export function selectDanceability(level: number) {
  const $userPreferences = get(userPreferences);
  $userPreferences.danceability = level;
  userPreferences.set($userPreferences);
}

export function selectSpeechiness(level: number) {
  const $userPreferences = get(userPreferences);
  $userPreferences.speechiness = level;
  userPreferences.set($userPreferences);
}

export function startMonitoring() {
  showSensorPage.set(false);
  showHomePage.set(true);
}

// API세팅
export function initYouTubePlayer() {
  const $playerReady = get(playerReady);
  const $currentVideoId = get(currentVideoId);
  const $player = get(player);
  
  if (!$playerReady || !$currentVideoId) return;
  
  // Reset progress state before initializing new player
  resetProgressState();
  
  if ($player) {
    $player.destroy();
    player.set(null);
  }
  const newPlayer = new (window as any).YT.Player("yt-player", {
    videoId: $currentVideoId,
    playerVars: {
      autoplay: 1,
      controls: 1
    },
    events: {
      onStateChange: onPlayerStateChange,
      onReady: onPlayerReady
    }
  });
  player.set(newPlayer);
}

export function onPlayerReady(event: any) {
  console.log("YouTube player is ready!");
  // Give the player a moment to fully initialize
  setTimeout(() => {
    trackProgress();
  }, 1000);
}

export function trackProgress() {
  const $player = get(player);
  if (!$player || !$player.getCurrentTime || !$player.getDuration) {
    console.log("Player not ready for progress tracking");
    return;
  }
  
  // Clear any existing progress interval
  if (progressInterval !== null) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
  
  console.log("Starting progress tracking");
  
  const updateProgress = () => {
    try {
      const currentTime = $player.getCurrentTime();
      const duration = $player.getDuration();
      
      if (duration && duration > 0) {
        const progress = (currentTime / duration) * 100;
        
        songCurrentTime.set(currentTime);
        songDuration.set(duration);
        songProgress.set(progress);
      }
    } catch (e) {
      console.log("Error tracking progress:", e);
    }
  };
  
  // Update progress every 500ms
  progressInterval = setInterval(() => {
    try {
      if ($player && $player.getPlayerState && $player.getPlayerState() === 1) { // Playing state
        updateProgress();
      } else if (!$player || $player.getPlayerState() === 0) { // Ended or destroyed
        console.log("Clearing progress interval - player ended or destroyed");
        if (progressInterval !== null) {
          clearInterval(progressInterval);
          progressInterval = null;
        }
      }
    } catch (e) {
      console.log("Error in progress interval:", e);
      if (progressInterval !== null) {
        clearInterval(progressInterval);
        progressInterval = null;
      }
    }
  }, 500);
}

export function onPlayerStateChange(event: any) {
  const YT = (window as any).YT;
  if (!YT) return;
  
  // Update playing state
  isPlaying.set(event.data === YT.PlayerState.PLAYING);
  
  if (event.data === YT.PlayerState.ENDED) {
    const $currentIndex = get(currentIndex);
    const $recommendations = get(recommendations);
    const nextIndex = $currentIndex + 1;
    if (nextIndex < $recommendations.length) {
      playRecommendation(nextIndex);
    }
  }
}

export function togglePlayPause() {
  const $player = get(player);
  const $isPlaying = get(isPlaying);
  
  if (!$player) return;
  
  if ($isPlaying) {
    $player.pauseVideo();
  } else {
    $player.playVideo();
  }
}

export function skipToNext() {
  const $currentIndex = get(currentIndex);
  const $recommendations = get(recommendations);
  const nextIndex = $currentIndex + 1;
  
  if (nextIndex < $recommendations.length) {
    playRecommendation(nextIndex);
  } else {
    console.log("No more songs in the playlist");
  }
}

// 곡 클릭시만 재생(text형태로 가지고 있다가 클릭시만 api 호출해서 불필요한 call 줄임임)
export async function playRecommendation(idx: number) {
  const $recommendations = get(recommendations);
  const $allAudioFeatures = get(allAudioFeatures);
  const $playerReady = get(playerReady);
  
  const rec = $recommendations[idx];
  if (!rec) return;

  resetProgressState();

  // Update current track info
  foundTrack.set({ name: rec.track_name, artist: rec.artist_name });

  // 이미 videoId가 있으면 바로 재생
  if (rec.videoId) {
    currentIndex.set(idx);
    currentVideoId.set(rec.videoId);
    // DOM이 바뀔 때까지 tick()으로 대기
    await tick();
    const $currentVideoId = get(currentVideoId);
    if ($playerReady && $currentVideoId) {
      initYouTubePlayer();
    }
    maybeLoadMoreRecommendations(idx);
    return;
  }

  // videoId가 없으면 API 호출
  const feat = $allAudioFeatures![rec.key];
  if (!feat) {
    console.warn("곡 정보를 찾을 수 없습니다.");
    // 다음 곡으로 넘어가기
    if (idx + 1 < $recommendations.length) {
      await playRecommendation(idx + 1);
    }
    return;
  }

  try {
    const searchQuery = `${feat.track_name} ${feat.artist_name}`;
    const videoId = await searchYoutubeVideo(searchQuery);

    // 검색 결과가 없으면 다음 곡으로 넘어감
    if (!videoId) {
      console.warn(`YouTube에서 ${rec.track_name}을(를) 찾지 못했습니다. 다음 곡으로 이동합니다.`);
      if (idx + 1 < $recommendations.length) {
        await playRecommendation(idx + 1);
      }
      return;
    }

    // 받은 ID를 저장하고 재생
    rec.videoId = videoId;
    currentIndex.set(idx);
    currentVideoId.set(videoId);
    // DOM이 바뀔 때까지 tick()으로 대기
    await tick();
    const $currentVideoId = get(currentVideoId);
    if ($playerReady && $currentVideoId) {
      initYouTubePlayer();
    }
    maybeLoadMoreRecommendations(idx);
  } catch (e) {
    console.error("YouTube 검색 오류:", e);
    // 검색 중 오류가 나도 다음 곡으로 넘어감
    if (idx + 1 < $recommendations.length) {
      await playRecommendation(idx + 1);
    }
  }
}

// 무한 재생 로직(현재곡 ~ 나머지 곡까지의 거리가 무조건 11이되도록록)
export async function maybeLoadMoreRecommendations(idx: number) {
  const $recommendations = get(recommendations);
  const remaining = $recommendations.length - idx;
  const desired = 11;
  const toAdd = desired - remaining;
  if (toAdd <= 0) return;

  const baseKey = $recommendations[idx].key;
  const excludeSet = new Set<string>($recommendations.map((r) => r.key));

  try {
    const more = await getMoreRecommendations(baseKey, excludeSet, toAdd);
    const startIdx = $recommendations.length;
    more.forEach((r, i) => {
      r.index = startIdx + i;
    });
    const newRecommendations = [...$recommendations, ...more];
    recommendations.set(newRecommendations);
    
    const newPlaylist = newRecommendations.map((r) => r.videoId || "");
    playlist.set(newPlaylist);
  } catch (e) {
    console.error("추가 추천 로드 중 오류:", e);
  }
}

// title기반검색을 하되 여러 result가 있으면 artist 고를 수 있게게
export async function handleSearch() {
  const $queryText = get(queryText);
  const $allAudioFeatures = get(allAudioFeatures);
  
  if (!$queryText.trim()) {
    errorMessage.set("검색어를 입력해 주세요.");
    return;
  }

  isSearching.set(true);
  errorMessage.set(null);
  recommendations.set([]);
  playlist.set([]);
  currentIndex.set(0);
  currentVideoId.set(null);
  ambiguousMatches.set([]);

  try {
    const matches: { key: string; track_name: string; artist_name: string }[] = [];
    for (const key in $allAudioFeatures!) {
      const feat = $allAudioFeatures![key];
      if (feat.track_name.toLowerCase() === $queryText.toLowerCase()) {
        matches.push({ key, track_name: feat.track_name, artist_name: feat.artist_name });
      }
    }

    if (matches.length === 0) {
      throw new Error("DB에서 입력한 곡을 찾지 못했습니다.");
    } else if (matches.length === 1) {
      await searchByKey(matches[0].key);
    } else {
      ambiguousMatches.set(matches);
    }
  } catch (err: any) {
    console.error(err);
    errorMessage.set(err.message || "알 수 없는 오류가 발생했습니다.");
  } finally {
    isSearching.set(false);
  }
}

// --- 10) 중복 곡 제목 선택 시 실제 검색/추천 실행 함수 -------------------
export async function searchByKey(foundKey: string) {
  const $allAudioFeatures = get(allAudioFeatures);
  
  try {
    isSearching.set(true);
    errorMessage.set(null);
    recommendations.set([]);
    playlist.set([]);
    currentIndex.set(0);
    currentVideoId.set(null);
    ambiguousMatches.set([]);

    // (A) YouTube에서 원곡 검색 → videoId 얻기
    const baseFeat = $allAudioFeatures![foundKey];
    const searchQuery = `${baseFeat.track_name} ${baseFeat.artist_name}`;
    const basicVideoId = await searchYoutubeVideo(searchQuery);
    if (!basicVideoId) {
      throw new Error("YouTube에서 해당 곡을 찾지 못했습니다.");
    }

    // (B) 초기 추천 10곡 생성
    const recsFromDB = await buildRecommendations(foundKey, 10);
    const merged: Recommendation[] = [];
    merged.push({
      key: foundKey,
      track_name: baseFeat.track_name,
      artist_name: baseFeat.artist_name,
      videoId: basicVideoId,
      index: 0
    });
    recsFromDB.forEach((r) => merged.push(r));

    recommendations.set(merged);
    const newPlaylist = merged.map((r) => r.videoId || "");
    playlist.set(newPlaylist);
    foundTrack.set({ name: baseFeat.track_name, artist: baseFeat.artist_name });

    // Set initial BPM tracking for threshold-based updates
    const $currentBpm = get(currentBpm);
    if ($currentBpm !== null) {
      lastRecommendationBpm = $currentBpm;
      console.log(`Initial playlist created with BPM: ${$currentBpm}`);
    }

    // 사용자가 ▶ 버튼을 누르도록 변경
    // await playRecommendation(0);
  } catch (err: any) {
    console.error(err);
    errorMessage.set(err.message || "알 수 없는 오류가 발생했습니다.");
  } finally {
    isSearching.set(false);
  }
}

// =================================
// DEMO MODE FUNCTIONALITY
// =================================

export async function startDemoMode() {
  isDemoMode.set(true);
  
  // Write initial demo heart rate to Firebase
  const initialBpm = 75;
  const timestamp = Date.now();
  
  try {
    await set(dbRef(rtdb, "heart_rate/current_bpm"), initialBpm);
    await set(dbRef(rtdb, "heart_rate/last_updated"), timestamp);
    console.log(`Demo mode activated! Initial BPM: ${initialBpm}`);
  } catch (error) {
    console.error("Error writing demo data to Firebase:", error);
    // Fallback to local state if Firebase fails
    currentBpm.set(initialBpm);
    lastUpdated.set(timestamp);
  }
}

export function stopDemoMode() {
  isDemoMode.set(false);
  // Stop any active workout simulation
  stopWorkoutDemo();
  // Reset BPM tracking when leaving demo mode
  lastRecommendationBpm = null;
  console.log("Demo mode deactivated!");
}

export async function setDemoHeartRate(bpm: number) {
  if (get(isDemoMode)) {
    const timestamp = Date.now();
    
    try {
      // Write to Firebase - this will trigger the onValue listeners
      await set(dbRef(rtdb, "heart_rate/current_bpm"), bpm);
      await set(dbRef(rtdb, "heart_rate/last_updated"), timestamp);
      console.log(`Demo heart rate set to ${bpm} BPM`);
    } catch (error) {
      console.error("Error writing demo heart rate to Firebase:", error);
      // Fallback to local state if Firebase fails
      currentBpm.set(bpm);
      lastUpdated.set(timestamp);
    }
  }
}

export async function startWorkoutDemo() {
  if (!get(isDemoMode)) return;
  
  // Stop any existing workout simulation
  stopWorkoutDemo();
  
  demoWorkoutActive.set(true);
  console.log("Starting automated workout demo...");
  
  // Workout phases with realistic BPM progression
  const phases = [
    // Phase 1: Warm-up (60 → 90 BPM over 15 seconds)
    { name: "Warming up...", startBpm: 60, endBpm: 90, duration: 15 },
    // Phase 2: Light exercise (90 → 120 BPM over 20 seconds)
    { name: "Light exercise...", startBpm: 90, endBpm: 120, duration: 20 },
    // Phase 3: High intensity (120 → 170 BPM over 15 seconds)
    { name: "High intensity!", startBpm: 120, endBpm: 170, duration: 15 },
    // Phase 4: Cool down start (170 → 130 BPM over 15 seconds)
    { name: "Cooling down...", startBpm: 170, endBpm: 130, duration: 15 },
    // Phase 5: Recovery (130 → 80 BPM over 20 seconds)
    { name: "Recovery...", startBpm: 130, endBpm: 80, duration: 20 },
    // Phase 6: Back to rest (80 → 65 BPM over 15 seconds)
    { name: "Back to rest", startBpm: 80, endBpm: 65, duration: 15 }
  ];
  
  let currentPhaseIndex = 0;
  let phaseStartTime = Date.now();
  
  const runWorkoutSimulation = async () => {
    if (currentPhaseIndex >= phases.length) {
      // Workout complete
      stopWorkoutDemo();
      console.log("Workout demo completed!");
      return;
    }
    
    const phase = phases[currentPhaseIndex];
    const elapsed = (Date.now() - phaseStartTime) / 1000; // seconds
    
    if (elapsed >= phase.duration) {
      // Move to next phase
      currentPhaseIndex++;
      phaseStartTime = Date.now();
      if (currentPhaseIndex < phases.length) {
        console.log(`Demo phase: ${phases[currentPhaseIndex].name}`);
      }
      return;
    }
    
    // Calculate current BPM for this phase
    const progress = elapsed / phase.duration;
    const bpmDiff = phase.endBpm - phase.startBpm;
    const currentBpm = Math.round(phase.startBpm + (bpmDiff * progress));
    
    // Update heart rate
    await setDemoHeartRate(currentBpm);
  };
  
  // Start the simulation
  console.log(`Demo phase: ${phases[0].name}`);
  demoWorkoutInterval = setInterval(runWorkoutSimulation, 1000); // Update every second
}

export function stopWorkoutDemo() {
  if (demoWorkoutInterval) {
    clearInterval(demoWorkoutInterval);
    demoWorkoutInterval = null;
  }
  demoWorkoutActive.set(false);
  console.log("Workout demo stopped");
}

export async function simulateWorkout() {
  // Legacy function - redirect to new automated demo
  await startWorkoutDemo();
}

// =================================
// THRESHOLD-BASED PLAYLIST UPDATES
// =================================

/**
 * Automatically regenerate recommendations if BPM change exceeds threshold
 * Only triggers if there's an active playlist and BPM change is significant
 */
async function checkAndUpdatePlaylistForBPM(newBpm: number) {
  const $recommendations = get(recommendations);
  const $foundTrack = get(foundTrack);
  
  // Only auto-update if we have an active playlist
  if ($recommendations.length === 0 || !$foundTrack) {
    return;
  }
  
  // Check if BPM change exceeds threshold
  if (lastRecommendationBpm !== null) {
    const bpmChange = Math.abs(newBpm - lastRecommendationBpm);
    
    if (bpmChange > BPM_UPDATE_THRESHOLD) {
      console.log(`BPM changed by ${bpmChange} (${lastRecommendationBpm} → ${newBpm}), regenerating playlist...`);
      
      try {
        // Find the base track (first recommendation or currently playing track)
        const $currentIndex = get(currentIndex);
        const baseRecommendation = $recommendations[$currentIndex] || $recommendations[0];
        
        if (baseRecommendation) {
          // Regenerate recommendations with new BPM
          const newRecommendations = await buildRecommendations(baseRecommendation.key, 10);
          
          // Preserve the currently playing track at index 0, add new recommendations after
          const updatedRecommendations: Recommendation[] = [
            baseRecommendation, // Keep current track
            ...newRecommendations
          ];
          
          // Update recommendations and playlist
          recommendations.set(updatedRecommendations);
          const newPlaylist = updatedRecommendations.map((r) => r.videoId || "");
          playlist.set(newPlaylist);
          
          // Update the BPM tracking
          lastRecommendationBpm = newBpm;
          
          console.log(`Playlist updated based on new BPM: ${newBpm}`);
        }
      } catch (error) {
        console.error("Error auto-updating playlist for BPM change:", error);
      }
    }
  }
} 