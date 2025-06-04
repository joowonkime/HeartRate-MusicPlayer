<script lang="ts">
  import { onMount } from "svelte";
  import { rtdb } from "./lib/firebase";
  import { ref as dbRef, onValue, get, set } from "firebase/database";
  import { searchYoutubeVideo } from "./lib/youtube-api";
  import { auth } from "./lib/firebase";
  import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
  import HeartLogo from "./assets/heart-logo.svg";

  let currentBpm: number | null = null;
  let lastUpdated: number | null = null;
  let queryText = "";
  interface TrackInfo {
    name: string;
  }
  let foundTrack: TrackInfo | null = null;
  let player: any = null;
  let playerReady = false;
  let playlist: string[] = [];
  let currentIndex = 0;
  let currentVideoId: string | null = null;
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
    track_name: string;
    videoId: string | null;
    index: number;
  };
  let recommendations: Recommendation[] = [];
  let isSearching = false;
  let errorMessage: string | null = null;
  let showLaunchScreen = true;
  let showWelcomePage = false;
  let showSignInPage = false;
  let showPreferencesPage = false;
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
    const timer = setTimeout(() => {
      showLaunchScreen = false;
      showWelcomePage = true;
    }, 3000);

    // Firebase Auth state listener
    onAuthStateChanged(auth, async (authUser) => {
      user = authUser;
      if (user) {
        // Check if user has preferences saved
        const hasPreferences = await checkUserPreferences(user.uid);
        if (hasPreferences) {
          // Existing user - go to main app
          showSignInPage = false;
          showWelcomePage = false;
          showPreferencesPage = false;
          // TODO: Add main app page
        } else {
          // First-time user - show preferences page
          showSignInPage = false;
          showWelcomePage = false;
          showPreferencesPage = true;
        }
      }
    });

    // Firebase real-time data setup
    (async () => {
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

      try {
        const snap = await get(dbRef(rtdb, "audioFeatures"));
        allAudioFeatures = snap.val() as Record<string, AudioFeature>;
      } catch (e) {
        console.error("DB에서 전체 오디오 피처를 가져오는 중 오류:", e);
      }
    })();

    return () => clearTimeout(timer);
  });

  async function checkUserPreferences(userId: string): Promise<boolean> {
    try {
      const snapshot = await get(dbRef(rtdb, `users/${userId}/preferences`));
      return snapshot.exists();
    } catch (error) {
      console.error("Error checking user preferences:", error);
      return false;
    }
  }

  async function saveUserPreferences() {
    if (!user) return;
    
    try {
      await set(dbRef(rtdb, `users/${user.uid}/preferences`), userPreferences);
      await set(dbRef(rtdb, `users/${user.uid}/createdAt`), Date.now());
      
      // Navigate to main app
      showPreferencesPage = false;
      // TODO: Add main app page
      console.log("Preferences saved, navigate to main app");
    } catch (error) {
      console.error("Error saving preferences:", error);
    }
  }

  function continueToApp() {
    showWelcomePage = false;
    showSignInPage = true;
  }

  function skipWelcome() {
    showWelcomePage = false;
    showSignInPage = true;
  }

  function skipSignIn() {
    showSignInPage = false;
    // TODO: Add main app page
    console.log("Skip sign in");
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
      // User will be redirected by the auth state listener
    } catch (error) {
      console.error("Error signing in:", error);
    }
  }

  // Preference handlers
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

  // YouTube IFrame API 로드
  onMount(() => {
    if (!document.getElementById("youtube-iframe-api")) {
      const tag = document.createElement("script");
      tag.id = "youtube-iframe-api";
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    (window as any).onYouTubeIframeAPIReady = () => {
      playerReady = true;
    };
  });

  // 유사도 계산 함수
  function euclideanDistance(a: AudioFeature, b: AudioFeature): number {
    const fields: (keyof AudioFeature)[] = [
      "danceability",
      "energy",
      "valence",
      "tempo",
    ];
    let sum = 0;
    for (const f of fields) {
      const da = a[f] as number;
      const db = b[f] as number;
      const diff = da - db;
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  // 추천 리스트 생성 및 YouTube ID 가져오기
  async function buildRecommendations() {
    if (!allAudioFeatures) {
      throw new Error("전체 AudioFeatures 데이터가 아직 로드되지 않았습니다.");
    }

    let foundKey: string | null = null;
    for (const key in allAudioFeatures) {
      const feat = allAudioFeatures[key];
      if (
        feat.track_name &&
        feat.track_name.toLowerCase() === queryText.toLowerCase()
      ) {
        foundKey = key;
        baseFeatures = feat;
        break;
      }
    }
    if (!foundKey || !baseFeatures) {
      throw new Error("DB에서 입력한 곡을 찾지 못했습니다.");
    }

    const distances: { key: string; dist: number }[] = [];
    for (const key in allAudioFeatures) {
      if (key === foundKey) continue;
      const feat = allAudioFeatures[key];
      const d = euclideanDistance(baseFeatures, feat);
      distances.push({ key, dist: d });
    }
    distances.sort((a, b) => a.dist - b.dist);

    const topN = distances.slice(0, 10).map((item) => {
      return allAudioFeatures![item.key].track_name;
    });

    const recs: Recommendation[] = [];
    for (let i = 0; i < topN.length; i++) {
      const name = topN[i];
      let videoId: string | null = null;
      try {
        videoId = await searchYoutubeVideo(name);
      } catch (e) {
        console.warn(`YouTube 검색 실패 (${name}):`, e);
      }
      recs.push({ track_name: name, videoId, index: i });
    }

    recommendations = recs;
    playlist = recs.map((r) => r.videoId || "");
  }

  // YouTube 플레이어 초기화 및 상태 변화 처리
  function initYouTubePlayer() {
    if (!playerReady || !currentVideoId) return;

    if (player) {
      player.destroy();
      player = null;
    }

    player = new (window as any).YT.Player("yt-player", {
      videoId: currentVideoId,
      events: {
        onStateChange: onPlayerStateChange,
      },
      playerVars: {
        autoplay: 1,
        controls: 1,
      },
    });
  }

  function onPlayerStateChange(event: any) {
    const YT = (window as any).YT;
    if (!YT) return;
    if (event.data === YT.PlayerState.ENDED) {
      const nextIndex = currentIndex + 1;
      if (nextIndex < recommendations.length) {
        playRecommendation(nextIndex);
      }
    }
  }

  $: if (currentVideoId && playerReady) {
    initYouTubePlayer();
  }

  // 추천곡 클릭 시 재생 함수
  function playRecommendation(idx: number) {
    const rec = recommendations[idx];
    if (!rec || !rec.videoId) {
      alert("이 곡의 YouTube 영상을 찾지 못했습니다.");
      return;
    }
    currentIndex = idx;
    currentVideoId = rec.videoId;
  }

  // handleSearch: 검색 + 추천 + 자동 재생
  async function handleSearch() {
    if (!queryText.trim()) {
      errorMessage = "검색어를 입력해 주세요.";
      return;
    }

    isSearching = true;
    errorMessage = null;
    foundTrack = null;
    recommendations = [];
    playlist = [];
    currentIndex = 0;
    currentVideoId = null;

    try {
      const basicVideoId = await searchYoutubeVideo(queryText);
      if (basicVideoId) {
        foundTrack = { name: queryText };
      } else {
        throw new Error("YouTube에서 해당 곡을 찾지 못했습니다.");
      }

      await buildRecommendations();

      if (recommendations[0]?.videoId) {
        currentIndex = 0;
        currentVideoId = recommendations[0].videoId;
      }
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
    <div class="launch-screen">
      <div class="ellipse-1"></div>
      
      <div class="heart-logo">
        <img src={HeartLogo} alt="HeartStream Logo" class="heart-ecg-icon" />
      </div>

      <div class="app-title">HEARTSTREAM</div>
    </div>
  {:else if showWelcomePage}
    <div class="welcome">
      <div class="ellipse-1"></div>
      
      <div class="heartstream">
        <span class="heartstream_span_01">H</span><span class="heartstream_span_02">EART</span><span class="heartstream_span_03">S</span><span class="heartstream_span_04">TREAM</span>
      </div>
      <div class="welcome_01"><span class="welcome_01_span">Welcome</span></div>
      <div class="description-text">
        <span>HeartStream is a music app that syncs with your heartbeat to instantly play the perfect song</span>
      </div>
      <button class="continue-button" on:click={continueToApp} type="button" aria-label="Continue to sign in">
        <span class="continue_span">Continue</span>
      </button>
      <div class="black-bg"></div>
      <div class="heart-logo-welcome">
        <img src={HeartLogo} alt="HeartStream Logo" class="heart-ecg-icon-small" />
      </div>
    </div>
  {:else if showSignInPage}
    <div class="sign-in">
      <div class="ellipse-1_01"></div>
      <div class="heartstream"><span class="heartstream_span_01">H</span><span class="heartstream_span_02">EART</span><span class="heartstream_span_03">S</span><span class="heartstream_span_04">TREAM</span></div>
      <div class="setup-your-profile"><span class="setupyourprofile_span">Setup your profile</span></div>
      <div class="sign-in-with-your-google-account-to-use-heartstream"><span class="signinwithyourgoogleaccounttouseheartstream_span">Sign in with your Google account to use HeartStream</span></div>
      <div class="heart-logo-signin">
        <img src={HeartLogo} alt="HeartStream Logo" class="heart-ecg-icon-signin" />
      </div>
      <button class="arrowleft-md" on:click={goBackFromSignIn} type="button" aria-label="Go back to welcome page">
        <div class="vector"></div>
      </button>
      <button class="rectangle-2" on:click={signInWithGoogle} type="button" aria-label="Sign in with Google">
        <img src="./assets/google.png" alt="Google" class="google-icon" />
        <div class="sign-in-with-google"><span class="signinwithgoogle_span">Sign in with Google</span></div>
      </button>
    </div>
  {:else if showPreferencesPage}
    <div class="preference">
      <div class="ellipse-1"></div>
      
      <div class="save-your-preferences"><span class="saveyourpreferences_span">Save Your Preferences</span></div>
      <button class="arrowleft-md" on:click={goBackFromPreferences} type="button" aria-label="Go back to sign in page">
        <div class="vector"></div>
      </button>
      
      <!-- Popularity Section -->
      <div class="section-title pos-top-193"><span class="section-title-span">Popularity</span></div>
      <div class="section-description pos-top-223"><span class="section-description-span">Do you vibe more with chart-toppers or hidden gems?</span></div>
      <button class="option-button left pos-top-260 {userPreferences.popularity === 'chart-toppers' ? 'selected' : ''}" on:click={() => selectPopularity('chart-toppers')} type="button" aria-label="Select chart-toppers" aria-pressed={userPreferences.popularity === 'chart-toppers'}></button>
      <button class="option-button right pos-top-260 {userPreferences.popularity === 'hidden-gems' ? 'selected' : ''}" on:click={() => selectPopularity('hidden-gems')} type="button" aria-label="Select hidden gems" aria-pressed={userPreferences.popularity === 'hidden-gems'}></button>
      <div class="option-label left pos-top-267">Chart-Toppers</div>
      <div class="option-label right pos-top-267">Hidden Gems</div>
      
      <!-- Danceability Section -->
      <div class="section-title pos-top-330"><span class="section-title-span">Danceability</span></div>
      <div class="section-description pos-top-364"><span class="section-description-span">How much groove do you want in your music?</span></div>
      <div class="section-labels left pos-top-445"><span class="section-labels">Mild groove</span></div>
      <div class="section-labels right pos-top-445"><span class="section-labels">Dancefloor-ready</span></div>
      <div class="rating-group pos-top-401">
        {#each Array(5) as _, i}
          <button class="rating-circle {userPreferences.danceability === i + 1 ? 'selected' : ''}" on:click={() => selectDanceability(i + 1)} type="button" aria-label="Select danceability level {i + 1}" aria-pressed={userPreferences.danceability === i + 1}></button>
        {/each}
      </div>
      
      <!-- Speechiness Section -->
      <div class="section-title pos-top-494"><span class="section-title-span">Speechness</span></div>
      <div class="section-description pos-top-528"><span class="section-description-span">Do you like lyric-heavy songs or more instrumental vibes?</span></div>
      <div class="rating-group pos-top-565">
        {#each Array(5) as _, i}
          <button class="rating-circle {userPreferences.speechiness === i + 1 ? 'selected' : ''}" on:click={() => selectSpeechiness(i + 1)} type="button" aria-label="Select speechiness level {i + 1}" aria-pressed={userPreferences.speechiness === i + 1}></button>
        {/each}
      </div>
      <div class="section-labels left pos-top-609"><span class="section-labels">Instrumental</span></div>
      <div class="section-labels right pos-top-609"><span class="section-labels">Lyric-focused</span></div>
      
      <!-- Energy Section -->
      <div class="section-title pos-top-658"><span class="section-title-span">Energy</span></div>
      <div class="section-description pos-top-692"><span class="section-description-span">How intense do you want your music to feel?</span></div>
      <div class="slider-container pos-top-740">
        <input type="range" min="0" max="1" step="0.1" bind:value={userPreferences.energy} on:input={updateEnergyLevel} class="slider-input" />
      </div>
      <div class="slider-indicator pos-top-736" style="left: {41 + (userPreferences.energy * 311)}px;"></div>
      
      <!-- Continue Button -->
      <button class="action-button pos-top-802" on:click={saveUserPreferences} type="button" aria-label="Save preferences and continue">
        <span class="action-button-text">Continue</span>
      </button>
    </div>
  {/if}
</div>
