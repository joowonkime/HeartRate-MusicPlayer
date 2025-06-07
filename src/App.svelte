<script lang="ts">
  import { onMount, tick } from "svelte";
  import { rtdb } from "./lib/firebase";
  import { ref as dbRef, onValue, get, set } from "firebase/database";
  import { searchYoutubeVideo } from "./lib/youtube-api";
  import { auth } from "./lib/firebase";
  import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";

  // --- 1) 화면에 표시할 변수 선언 -------------------------------------
  let currentBpm: number | null = null;
  let lastUpdated: number | null = null;
  let queryText = "";
  
  interface TrackInfo {
    name: string;
    artist: string;
  }
  let foundTrack: TrackInfo | null = null;
  let player: any = null;
  let playerReady = false;
  let playlist: string[] = [];
  let currentIndex = 0;
  let currentVideoId: string | null = null;
  
  // Progress tracking variables
  let songProgress = 0; // 0-100 percentage
  let songDuration = 0;
  let songCurrentTime = 0;
  let isPlaying = false; // Track playing state
  
  interface AudioFeature {
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
  
  let allAudioFeatures: Record<string, AudioFeature> | null = null;
  let baseFeatures: AudioFeature | null = null;
  
  type Recommendation = {
    key: string;
    track_name: string;
    artist_name: string;
    videoId: string | null;
    index: number;
  };
  
  let recommendations: Recommendation[] = [];
  
  // "중복 검색 결과"를 담을 배열
  let ambiguousMatches: { key: string; track_name: string; artist_name: string }[] = [];
  
  // 사용자 입력(가중치) 예시
  let userInputAssumption: {
    danceability: number;
    energy: number;
    instrumentalness: number;
    liveness: number;
    valence: number;
  } = {
    danceability: 0.5,
    energy: 0.5,
    instrumentalness: 0.5,
    liveness: 0.5,
    valence: 0.5
  };
  
  let isSearching = false;
  let errorMessage: string | null = null;
  let showLaunchScreen = true;
  let showWelcomePage = false;
  let showSignInPage = false;
  let showPreferencesPage = false;
  let showSensorPage = false;
  let showHomePage = false;
  let user: any = null;

  // User preferences
  let userPreferences = {
    energy: 0.5, // 0-1 scale
    popularity: 'hidden-gems', // 'chart-toppers' or 'hidden-gems'
    danceability: 3, // 1-5 scale
    speechiness: 3 // 1-5 scale
  };

  // Auto-hide launch screen after 3 seconds
  onMount(() => {
    console.log("App mounted, checking initial auth state...");
    console.log("Current user on mount:", auth.currentUser);
    
    const timer = setTimeout(() => {
      showLaunchScreen = false;
      showWelcomePage = true;
    }, 3000);

    // Firebase Auth state listener
    onAuthStateChanged(auth, async (authUser) => {
      console.log("Auth state changed:", authUser ? "User signed in" : "User signed out");
      user = authUser;
      if (user) {
        console.log("Checking user preferences for:", user.uid);
        // Check if user has preferences saved
        const hasPreferences = await checkUserPreferences(user.uid);
        console.log("Has preferences:", hasPreferences);
        
        if (hasPreferences) {
          // Existing user - go to sensor page first
          console.log("Existing user - navigating to sensor page");
          showSignInPage = false;
          showWelcomePage = false;
          showPreferencesPage = false;
          showHomePage = false;
          showSensorPage = true;
        } else {
          // First-time user - show preferences page
          console.log("New user - navigating to preferences page");
          showSignInPage = false;
          showWelcomePage = false;
          showPreferencesPage = true;
        }
      }
    });

    // --- 2) Firebase real-time data setup & YouTube IFrame API 로드 ----
    (async () => {
      // 심박수 subscribe
      const bpmRef = dbRef(rtdb, "heart_rate/current_bpm");
      onValue(bpmRef, (snapshot) => {
        const val = snapshot.val();
        currentBpm = val !== null ? Number(val) : null;
      });
      const updatedRef = dbRef(rtdb, "heart_rate/last_updated");
      onValue(updatedRef, (snapshot) => {
        const val = snapshot.val();
        lastUpdated = val !== null ? Number(val) : null;
      });

      // database audiofeatures load
      try {
        const snap = await get(dbRef(rtdb, "audioFeatures"));
        allAudioFeatures = snap.val() as Record<string, AudioFeature>;
      } catch (e) {
        console.error("DB에서 전체 오디오 피처를 가져오는 중 오류:", e);
      }
    })();

    // YouTube IFrame API setup
    function markPlayerReady() {
      playerReady = true;
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
  });

  async function checkUserPreferences(userId: string): Promise<boolean> {
    try {
      console.log("Checking preferences for user ID:", userId);
      const snapshot = await get(dbRef(rtdb, `users/${userId}/preferences`));
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

  async function saveUserPreferences() {
    if (!user) return;
    
    // Map UI preferences to algorithmic preferences
    userInputAssumption.energy = userPreferences.energy;
    userInputAssumption.danceability = userPreferences.danceability / 5; // Convert 1-5 to 0-1
    userInputAssumption.valence = userPreferences.popularity === 'chart-toppers' ? 0.7 : 0.3;
    userInputAssumption.instrumentalness = (6 - userPreferences.speechiness) / 5; // Inverse relationship
    
    try {
      await set(dbRef(rtdb, `users/${user.uid}/preferences`), userPreferences);
      await set(dbRef(rtdb, `users/${user.uid}/createdAt`), Date.now());
      
      // Navigate to sensor page
      showPreferencesPage = false;
      showSensorPage = true;
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
  function hybridDistance(
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
    if (currentBpm) {
      const w_bpm = Math.min(currentBpm / 200, 1);
      const tempoVal = candidate.tempo;
      const bpmDiff = Math.abs(tempoVal - currentBpm);
      const weightedBpmDiff = w_bpm * bpmDiff;
      bpmComponent = weightedBpmDiff * weightedBpmDiff;
    }

    return Math.sqrt(sumSq + bpmComponent);
  }

  // 추천음악생성성
  async function buildRecommendations(
    baseKey: string,
    limit: number
  ): Promise<Recommendation[]> {
    if (!allAudioFeatures) {
      throw new Error("전체 AudioFeatures 데이터가 아직 로드되지 않았습니다.");
    }
    const baseFeat = allAudioFeatures[baseKey];
    if (!baseFeat) {
      throw new Error("DB에서 원곡을 찾을 수 없습니다.");
    }

    const distances: { key: string; dist: number }[] = [];
    for (const key in allAudioFeatures) {
      if (key === baseKey) continue;
      const feat = allAudioFeatures[key];
      if (feat.duration_ms <= 75000 || feat.track_name.includes("The Wheels on the Bus"))
        continue;
      const d = hybridDistance(feat, baseFeat, userInputAssumption);
      distances.push({ key, dist: d });
    }
    distances.sort((a, b) => a.dist - b.dist);

    const top = distances.slice(0, limit);
    const recs: Recommendation[] = [];
    for (let i = 0; i < top.length; i++) {
      const key = top[i].key;
      const feat = allAudioFeatures[key];
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
  async function getMoreRecommendations(
    baseKey: string,
    excludeSet: Set<string>,
    count: number
  ): Promise<Recommendation[]> {
    if (!allAudioFeatures) {
      throw new Error("전체 AudioFeatures 데이터가 아직 로드되지 않았습니다.");
    }
    const baseFeat = allAudioFeatures[baseKey];
    if (!baseFeat) {
      throw new Error("DB에서 기준 곡을 찾을 수 없습니다.");
    }

    const distances: { key: string; dist: number }[] = [];
    for (const key in allAudioFeatures) {
      if (excludeSet.has(key)) continue;
      const feat = allAudioFeatures[key];
      if (feat.duration_ms <= 75000) continue;
      const d = hybridDistance(feat, baseFeat, userInputAssumption);
      distances.push({ key, dist: d });
    }
    distances.sort((a, b) => a.dist - b.dist);

    const top = distances.slice(0, count);
    const recs: Recommendation[] = [];
    for (let i = 0; i < top.length; i++) {
      const key = top[i].key;
      const feat = allAudioFeatures[key];
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

  function continueToApp() {
    showWelcomePage = false;
    showSignInPage = true;
  }

  function goBackFromSignIn() {
    showSignInPage = false;
    showWelcomePage = true;
  }

  function goBackFromPreferences() {
    showPreferencesPage = false;
    showSignInPage = true;
  }

  async function signInWithGoogle() {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      console.log("User signed in:", result.user);
    } catch (error) {
      console.error("Error signing in:", error);
    }
  }

  async function signOutUser() {
    try {
      await signOut(auth);
      console.log("User signed out");
      showLaunchScreen = false;
      showWelcomePage = true;
      showSignInPage = false;
      showPreferencesPage = false;
      showSensorPage = false;
      showHomePage = false;
      user = null;
    } catch (error) {
      console.error("Error signing out:", error);
    }
  }

  function updateEnergyLevel(event: Event) {
    const target = event.target as HTMLInputElement;
    userPreferences.energy = parseFloat(target.value);
  }

  function selectPopularity(type: 'chart-toppers' | 'hidden-gems') {
    userPreferences.popularity = type;
  }

  function selectDanceability(level: number) {
    userPreferences.danceability = level;
  }

  function selectSpeechiness(level: number) {
    userPreferences.speechiness = level;
  }

  function startMonitoring() {
    showSensorPage = false;
    showHomePage = true;
  }

  // API세팅팅
  function initYouTubePlayer() {
    if (!playerReady || !currentVideoId) return;
    if (player) {
      player.destroy();
      player = null;
    }
    player = new (window as any).YT.Player("yt-player", {
      videoId: currentVideoId,
      playerVars: {
        autoplay: 1,
        controls: 1,
        origin: window.location.origin
      },
      events: {
        onStateChange: onPlayerStateChange,
        onReady: onPlayerReady
      }
    });
  }

  function onPlayerReady(event: any) {
    // Start tracking progress
    trackProgress();
  }

  function trackProgress() {
    if (!player || !player.getCurrentTime || !player.getDuration) return;
    
    const updateProgress = () => {
      try {
        songCurrentTime = player.getCurrentTime();
        songDuration = player.getDuration();
        songProgress = songDuration > 0 ? (songCurrentTime / songDuration) * 100 : 0;
      } catch (e) {
        // Player not ready yet
      }
    };
    
    // Update progress every 500ms
    const progressInterval = setInterval(() => {
      if (player && player.getPlayerState && player.getPlayerState() === 1) { // Playing state
        updateProgress();
      } else if (!player || player.getPlayerState() === 0) { // Ended or destroyed
        clearInterval(progressInterval);
      }
    }, 500);
  }

  function onPlayerStateChange(event: any) {
    const YT = (window as any).YT;
    if (!YT) return;
    
    // Update playing state
    isPlaying = event.data === YT.PlayerState.PLAYING;
    
    if (event.data === YT.PlayerState.ENDED) {
      const nextIndex = currentIndex + 1;
      if (nextIndex < recommendations.length) {
        playRecommendation(nextIndex);
      }
    }
  }

  function togglePlayPause() {
    if (!player) return;
    
    if (isPlaying) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
  }

  $: if (currentVideoId && playerReady) {
    initYouTubePlayer();
  }

  // 곡 클릭시만 재생(text형태로 가지고 있다가 클릭시만 api 호출해서 불필요한 call 줄임임)
  async function playRecommendation(idx: number) {
    const rec = recommendations[idx];
    if (!rec) return;

    // Update current track info
    foundTrack = { name: rec.track_name, artist: rec.artist_name };

    // 이미 videoId가 있으면 바로 재생
    if (rec.videoId) {
      currentIndex = idx;
      currentVideoId = rec.videoId;
      // DOM이 바뀔 때까지 tick()으로 대기
      await tick();
      if (playerReady && currentVideoId) {
        initYouTubePlayer();
      }
      maybeLoadMoreRecommendations(idx);
      return;
    }

    // videoId가 없으면 API 호출
    const feat = allAudioFeatures![rec.key];
    if (!feat) {
      console.warn("곡 정보를 찾을 수 없습니다.");
      // 다음 곡으로 넘어가기
      if (idx + 1 < recommendations.length) {
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
        if (idx + 1 < recommendations.length) {
          await playRecommendation(idx + 1);
        }
        return;
      }

      // 받은 ID를 저장하고 재생
      rec.videoId = videoId;
      currentIndex = idx;
      currentVideoId = videoId;
      // DOM이 바뀔 때까지 tick()으로 대기
      await tick();
      if (playerReady && currentVideoId) {
        initYouTubePlayer();
      }
      maybeLoadMoreRecommendations(idx);
    } catch (e) {
      console.error("YouTube 검색 오류:", e);
      // 검색 중 오류가 나도 다음 곡으로 넘어감
      if (idx + 1 < recommendations.length) {
        await playRecommendation(idx + 1);
      }
    }
  }

  // 무한 재생 로직(현재곡 ~ 나머지 곡까지의 거리가 무조건 11이되도록록)
  async function maybeLoadMoreRecommendations(idx: number) {
    const remaining = recommendations.length - idx;
    const desired = 11;
    const toAdd = desired - remaining;
    if (toAdd <= 0) return;

    const baseKey = recommendations[idx].key;
    const excludeSet = new Set<string>(recommendations.map((r) => r.key));

    try {
      const more = await getMoreRecommendations(baseKey, excludeSet, toAdd);
      const startIdx = recommendations.length;
      more.forEach((r, i) => {
        r.index = startIdx + i;
      });
      recommendations = [...recommendations, ...more];
      playlist = recommendations.map((r) => r.videoId || "");
    } catch (e) {
      console.error("추가 추천 로드 중 오류:", e);
    }
  }

  // title기반검색을 하되 여러 result가 있으면 artist 고를 수 있게게
  async function handleSearch() {
    if (!queryText.trim()) {
      errorMessage = "검색어를 입력해 주세요.";
      return;
    }

    isSearching = true;
    errorMessage = null;
    recommendations = [];
    playlist = [];
    currentIndex = 0;
    currentVideoId = null;
    ambiguousMatches = [];

    try {
      const matches: { key: string; track_name: string; artist_name: string }[] = [];
      for (const key in allAudioFeatures!) {
        const feat = allAudioFeatures![key];
        if (feat.track_name.toLowerCase() === queryText.toLowerCase()) {
          matches.push({ key, track_name: feat.track_name, artist_name: feat.artist_name });
        }
      }

      if (matches.length === 0) {
        throw new Error("DB에서 입력한 곡을 찾지 못했습니다.");
      } else if (matches.length === 1) {
        await searchByKey(matches[0].key);
      } else {
        ambiguousMatches = matches;
      }
    } catch (err: any) {
      console.error(err);
      errorMessage = err.message || "알 수 없는 오류가 발생했습니다.";
    } finally {
      isSearching = false;
    }
  }

  // --- 10) 중복 곡 제목 선택 시 실제 검색/추천 실행 함수 -------------------
  async function searchByKey(foundKey: string) {
    try {
      isSearching = true;
      errorMessage = null;
      recommendations = [];
      playlist = [];
      currentIndex = 0;
      currentVideoId = null;
      ambiguousMatches = [];

      // (A) YouTube에서 원곡 검색 → videoId 얻기
      const baseFeat = allAudioFeatures![foundKey];
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

      recommendations = merged;
      playlist = merged.map((r) => r.videoId || "");
      foundTrack = { name: baseFeat.track_name, artist: baseFeat.artist_name };

      // 사용자가 ▶ 버튼을 누르도록 변경
      // await playRecommendation(0);
    } catch (err: any) {
      console.error(err);
      errorMessage = err.message || "알 수 없는 오류가 발생했습니다.";
    } finally {
      isSearching = false;
    }
  }
</script>

<div class="mobile-container">
  {#if showLaunchScreen}
    <div class="page-container">
      <div class="bg-blur bg-blur-main"></div>
      
      <div class="content-section flex-center" style="width: 300px; height: 300px; left: 66px; top: 213px;">
        <img src="/assets/heart-logo.svg" alt="HeartStream Logo" class="icon-medium icon-heart" />
      </div>

      <div class="content-section heading-large" style="left: 50%; top: 580px; transform: translateX(-50%);">HEARTSTREAM</div>
    </div>
  {:else if showWelcomePage}
    <div class="page-container">
      <div class="bg-blur bg-blur-main"></div>
      
      <div class="content-section" style="width: 201px; left: 116px; top: 143px;">
        <span style="font-size: 24px; color: var(--color-text-muted); font-family: var(--font-kode);">H</span><span style="font-size: 24px; color: var(--color-text); font-family: var(--font-kode);">EART</span><span style="font-size: 24px; color: var(--color-text-muted); font-family: var(--font-kode);">S</span><span style="font-size: 24px; color: var(--color-text); font-family: var(--font-kode);">TREAM</span>
      </div>
      <div class="content-section heading-medium" style="width: 332px; left: 50px; top: 601px; font-size: 33px; letter-spacing: 0.33px;">Welcome</div>
      <div class="content-section text-description" style="width: 321px; left: 61px; top: 650px;">
        <span>HeartStream is a music app that syncs with your heartbeat to instantly play the perfect song</span>
      </div>
      <button class="btn-primary" style="width: 144px; height: 50px; padding: 11px; left: 142px; top: 740px; font-size: 22px;" on:click={continueToApp} type="button" aria-label="Continue to sign in">
        Continue
      </button>
      <div style="width: 95.58px; height: 89.72px; left: 168.71px; top: 280px; mix-blend-mode: multiply; background: linear-gradient(153deg, rgba(127, 119, 119, 0.70) 0%, rgba(61, 58, 58, 0.70) 100%); box-shadow: 4px 4px 4px rgba(0, 0, 0, 0.20); border-radius: 10px; border: 1px rgba(0, 0, 0, 0.10) solid; position: absolute;"></div>
      <div class="content-section flex-center" style="width: 102px; height: 102px; left: 167px; top: 278px;">
        <img src="/assets/heart-logo.svg" alt="HeartStream Logo" class="icon-small icon-heart" />
      </div>
    </div>
  {:else if showSignInPage}
    <div class="page-container">
      <div class="bg-blur bg-blur-signin"></div>
      <div class="content-section" style="width: 201px; left: 116px; top: 143px;">
        <span style="font-size: 24px; color: var(--color-text-muted); font-family: var(--font-kode);">H</span><span style="font-size: 24px; color: var(--color-text); font-family: var(--font-kode);">EART</span><span style="font-size: 24px; color: var(--color-text-muted); font-family: var(--font-kode);">S</span><span style="font-size: 24px; color: var(--color-text); font-family: var(--font-kode);">TREAM</span>
      </div>
      <div class="content-section heading-medium" style="width: 277px; left: 79px; top: 613px; font-size: 33px; font-weight: 700;">Setup your profile</div>
      <div class="content-section text-description" style="width: 362px; left: 36px; top: 662px;">Sign in with your Google account to use HeartStream</div>
      <div class="content-section flex-center icon-large" style="left: 74px; top: 176px;">
        <img src="/assets/heart-logo.svg" alt="HeartStream Logo" class="icon-medium icon-heart" />
      </div>
      <button class="absolute flex-center" style="width: 28px; height: 32px; left: 25px; top: 60px;" on:click={goBackFromSignIn} type="button" aria-label="Go back to welcome page">
        <div style="width: 20px; height: 15px; background: var(--color-text); clip-path: polygon(40% 0%, 40% 35%, 100% 35%, 100% 65%, 40% 65%, 40% 100%, 0% 50%);"></div>
      </button>
      <button class="btn-primary" style="width: 362px; height: 67px; left: 35px; top: 714px; border-radius: 15px; gap: 15px; font-size: 22px;" on:click={signInWithGoogle} type="button" aria-label="Sign in with Google">
        <img src="/assets/google.png" alt="Google" style="width: 28px; height: 28px; border-radius: 4px;" />
        Sign in with Google
      </button>
    </div>
  {:else if showPreferencesPage}
    <div class="page-container">
      <div style="width: 266px; height: 266px; left: -41px; bottom: -100px; position: absolute; background: var(--color-accent); box-shadow: 300px 300px 300px; border-radius: 50%; filter: blur(150px);"></div>
      
      <div class="content-section heading-medium" style="width: 277px; left: 79px; top: 121px;">Save Your Preferences</div>
      <button class="absolute flex-center" style="width: 28px; height: 32px; left: 25px; top: 60px;" on:click={goBackFromPreferences} type="button" aria-label="Go back to sign in page">
        <div style="width: 20px; height: 15px; background: var(--color-text); clip-path: polygon(40% 0%, 40% 35%, 100% 35%, 100% 65%, 40% 65%, 40% 100%, 0% 50%);"></div>
      </button>
      
      <!-- Popularity Section -->
      <div class="heading-small" style="position: absolute; top: 193px; width: 350px; left: 40px; text-align: left;">Popularity</div>
      <div class="text-small" style="position: absolute; top: 223px; width: 367px; left: 40px; text-align: left; color: rgba(255, 255, 255, 0.70); font-weight: 600;">Do you vibe more with chart-toppers or hidden gems?</div>
      <button class="option-toggle {userPreferences.popularity === 'chart-toppers' ? 'selected' : ''}" style="width: 163px; height: 34px; top: 260px; left: 41px;" on:click={() => selectPopularity('chart-toppers')} type="button" aria-label="Select chart-toppers" aria-pressed={userPreferences.popularity === 'chart-toppers'}></button>
      <button class="option-toggle {userPreferences.popularity === 'hidden-gems' ? 'selected' : ''}" style="width: 163px; height: 34px; top: 260px; left: 230px;" on:click={() => selectPopularity('hidden-gems')} type="button" aria-label="Select hidden gems" aria-pressed={userPreferences.popularity === 'hidden-gems'}></button>
      <div class="text-small" style="position: absolute; top: 267px; width: 127px; left: 57px; text-align: center; font-weight: 600;">Chart-Toppers</div>
      <div class="text-small" style="position: absolute; top: 267px; width: 131px; left: 246px; text-align: center; color: #1E1E1E; font-weight: 700;">Hidden Gems</div>
      
      <!-- Danceability Section -->
      <div class="heading-small" style="position: absolute; top: 330px; width: 350px; left: 40px; text-align: left;">Danceability</div>
      <div class="text-small" style="position: absolute; top: 364px; width: 367px; left: 40px; text-align: left; color: rgba(255, 255, 255, 0.70); font-weight: 600;">How much groove do you want in your music?</div>
      <div class="text-small" style="position: absolute; top: 445px; width: 120px; left: 50px; text-align: left; color: rgba(255, 255, 255, 0.70); font-weight: 600;">Mild groove</div>
      <div class="text-small" style="position: absolute; top: 445px; width: 120px; right: 50px; text-align: right; color: rgba(255, 255, 255, 0.70); font-weight: 600;">Dancefloor-ready</div>
      <div style="position: absolute; top: 401px; width: 335px; left: 50px; display: flex; justify-content: flex-start; align-items: center; gap: 45px;">
        {#each Array(5) as _, i}
          <button class="rating-control {userPreferences.danceability === i + 1 ? 'selected' : ''}" on:click={() => selectDanceability(i + 1)} type="button" aria-label="Select danceability level {i + 1}" aria-pressed={userPreferences.danceability === i + 1}></button>
        {/each}
      </div>
      
      <!-- Speechiness Section -->
      <div class="heading-small" style="position: absolute; top: 494px; width: 350px; left: 40px; text-align: left;">Speechness</div>
      <div class="text-small" style="position: absolute; top: 528px; width: 367px; left: 40px; text-align: left; color: rgba(255, 255, 255, 0.70); font-weight: 600;">Do you like lyric-heavy songs or more instrumental vibes?</div>
      <div style="position: absolute; top: 565px; width: 335px; left: 50px; display: flex; justify-content: flex-start; align-items: center; gap: 45px;">
        {#each Array(5) as _, i}
          <button class="rating-control {userPreferences.speechiness === i + 1 ? 'selected' : ''}" on:click={() => selectSpeechiness(i + 1)} type="button" aria-label="Select speechiness level {i + 1}" aria-pressed={userPreferences.speechiness === i + 1}></button>
        {/each}
      </div>
      <div class="text-small" style="position: absolute; top: 609px; width: 120px; left: 50px; text-align: left; color: rgba(255, 255, 255, 0.70); font-weight: 600;">Instrumental</div>
      <div class="text-small" style="position: absolute; top: 609px; width: 120px; right: 50px; text-align: right; color: rgba(255, 255, 255, 0.70); font-weight: 600;">Lyric-focused</div>
      
      <!-- Energy Section -->
      <div class="heading-small" style="position: absolute; top: 658px; width: 350px; left: 40px; text-align: left;">Energy</div>
      <div class="text-small" style="position: absolute; top: 692px; width: 367px; left: 40px; text-align: left; color: rgba(255, 255, 255, 0.70); font-weight: 600;">How intense do you want your music to feel?</div>
      <div class="slider-track" style="width: 351px; height: 12px; left: 41px; top: 740px;">
        <input type="range" min="0" max="1" step="0.1" bind:value={userPreferences.energy} on:input={updateEnergyLevel} class="slider-input" />
      </div>
      <div class="slider-thumb" style="top: 736px; left: {41 + (userPreferences.energy * 311)}px;"></div>
      
      <!-- Continue Button -->
      <button class="btn-action" style="width: 352px; height: 67px; padding: 11px 17px; left: 41px; top: 802px;" on:click={saveUserPreferences} type="button" aria-label="Save preferences and continue">
        Continue
      </button>
    </div>
  {:else if showSensorPage}
    <div class="page-container">
      <div style="width: 266px; height: 266px; left: 84px; top: 297px; background: rgba(255, 34.61, 75.02, 0.60); position: absolute; box-shadow: 300px 300px 300px; border-radius: 50%; filter: blur(150px);"></div>
      <div class="content-section heading-medium" style="width: 277px; left: 79px; top: 121px;">
        Connect to Sensor
      </div>
      <img src="/assets/sensor.png" alt="Heart Rate Sensor" style="width: 180px; height: 180px; left: 131px; top: 322px; position: absolute; opacity: 0.8;" />
      <div class="content-section text-medium" style="width: 268px; left: 87px; top: 563px; color: rgba(229, 229, 229, 0.90); font-size: 18px; font-weight: 400;">
        Place your finger on the sensor
      </div>
      <button class="btn-primary" style="width: 352px; height: 67px; padding: 11px 17px; left: 41px; top: 802px; background: rgb(255, 255, 255); border-radius: 10px; font-size: 22px;" on:click={startMonitoring} type="button" aria-label="Start monitoring heart rate">
        Start Monitoring
      </button>
    </div>
  {:else if showHomePage}
    <div class="page-container">
      <div class="bg-blur bg-blur-homepage"></div>
      <div style="width: 200px; height: 200px; left: -70px; top: -70px; position: absolute; background: var(--color-accent); box-shadow: 200px 200px 200px; border-radius: 50%; filter: blur(100px);"></div>
      <div class="heart-rate-label">Your Current Heart Rate is</div>
      <div class="section-heading">Choose a song to start with</div>
      <div class="heart-rate-container"></div>
      <div class="user-welcome">Welcome</div>
      <div class="user-name">{user?.displayName || 'User'}</div>
      <img class="user-avatar" src="{user?.photoURL || 'https://placehold.co/34x34'}" alt="User Avatar" />
      <div class="timestamp">
        Last Update: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : 'No data'}
      </div>
      <div class="heart-rate-value">{currentBpm || '--'}</div>
      <div class="search-container"></div>
      <input 
        class="search-input" 
        bind:value={queryText}
        placeholder="Browse Library"
        on:keydown={(e) => e.key === 'Enter' && handleSearch()}
      />
      <button class="search-button" on:click={handleSearch} type="button" aria-label="Search for music">
        <div class="search-icon"></div>
      </button>
      <button class="signout-button" on:click={signOutUser} type="button" aria-label="Sign out">
        <div class="signout-background"></div>
        <div class="signout-text">sign out</div>
      </button>
      <div class="ecg-line">
        <div class="ecg-grid"></div>
        <div class="ecg-wave"></div>
      </div>
      
      <!-- Music Player - Always visible -->
      <div class="music-player">
        <div class="player-top-section"></div>
        <div class="player-bottom-section"></div>
        <div class="player-divider"></div>
        <button class="play-pause-button" on:click={togglePlayPause} type="button" aria-label="{isPlaying ? 'Pause' : 'Play'} music">
          <div class="play-pause-icon {isPlaying ? 'pause' : 'play'}"></div>
        </button>
        <div class="track-title">
          {foundTrack?.name || 'MUSIC NAME'}
        </div>
        <div class="track-artist">
          {foundTrack?.artist || 'Artist Name'}
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: {songProgress}%"></div>
        </div>
      </div>
      
      <!-- YouTube Player (hidden) -->
      <div id="yt-player" style="display: none;"></div>
      
      <!-- Song Disambiguation Interface -->
      {#if ambiguousMatches.length > 0}
        <div class="disambiguation-overlay">
          <div class="disambiguation-header">
            <h3>Multiple songs found for "{queryText}"</h3>
            <p>Please select the correct song:</p>
          </div>
          <div class="disambiguation-list">
            {#each ambiguousMatches as match}
              <button 
                class="disambiguation-item"
                on:click={() => searchByKey(match.key)}
                type="button"
                aria-label="Select {match.track_name} by {match.artist_name}"
              >
                <span class="song-title">{match.track_name}</span>
                <span class="song-artist">by {match.artist_name}</span>
              </button>
            {/each}
          </div>
          <button class="disambiguation-close" on:click={() => ambiguousMatches = []} aria-label="Close disambiguation">
            Cancel
          </button>
        </div>
      {/if}
      
      <!-- Recommendations List -->
      {#if recommendations.length > 0 && ambiguousMatches.length === 0}
        <div class="recommendations-overlay">
          <div class="recommendations-header">
            <h3>Up Next</h3>
            <button on:click={() => recommendations = []} aria-label="Close recommendations">×</button>
          </div>
          <div class="recommendations-list">
            {#each recommendations as rec, idx}
              <button 
                class="recommendation-item {currentIndex === idx ? 'playing' : ''}"
                on:click={() => playRecommendation(idx)}
                type="button"
                aria-label="Play {rec.track_name} by {rec.artist_name}"
              >
                <div class="track-info">
                  <span class="track-full">
                    {#if rec.index === 0}🔹♥️ {/if}{rec.track_name} - {rec.artist_name}
                  </span>
                </div>
                {#if currentIndex === idx}
                  <span class="playing-indicator">♪</span>
                {:else}
                  <span class="play-button">▶</span>
                {/if}
              </button>
            {/each}
          </div>
        </div>
      {/if}
      
      <!-- Search Loading -->
      {#if isSearching}
        <div class="search-loading">
          <div class="loading-spinner"></div>
          <p>Finding perfect music for your vibe...</p>
        </div>
      {/if}
      
      <!-- Error Message -->
      {#if errorMessage}
        <div class="error-message">
          <p>{errorMessage}</p>
          <button on:click={() => errorMessage = null}>Dismiss</button>
        </div>
      {/if}
    </div>
  {/if}
</div>
