<script lang="ts">
  import { onMount } from "svelte";
  import { rtdb } from "./lib/firebase";
  import { ref as dbRef, onValue, get } from "firebase/database";
  import { searchYoutubeVideo } from "./lib/youtube-api";


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

<style>
  .container {
    max-width: 800px;
    margin: 0 auto;
    padding: 1rem;
    font-family: Arial, sans-serif;
  }
  h1 {
    text-align: center;
  }
  .bpm-card,
  .search-card,
  .rec-card {
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 1rem;
    margin-bottom: 1rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  .bpm-value {
    font-size: 2rem;
    font-weight: bold;
    color: #e53935;
  }
  .search-container {
    display: flex;
    gap: 0.5rem;
  }
  input[type="text"] {
    flex: 1;
    padding: 0.5rem;
    font-size: 1rem;
  }
  button {
    padding: 0.5rem 1rem;
    font-size: 1rem;
    background-color: #1db954;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  button:disabled {
    background-color: #aaa;
    cursor: not-allowed;
  }
  .rec-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .rec-item {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem;
    border-bottom: 1px solid #ddd;
    cursor: pointer;
  }
  .rec-item:hover {
    background-color: #f9f9f9;
  }
  .rec-item.selected {
    background-color: #e0f7fa;
  }
  .youtube-player {
    margin-top: 1rem;
    text-align: center;
  }
  #yt-player {
    width: 100%;
    max-width: 560px;
    height: 315px;
    margin: 0 auto;
  }
</style>

<div class="container">
  <h1>🎵 Heart-Beat 기반 뮤직 플레이어 (추천 Playlist)</h1>

  <div class="bpm-card">
    <h2>실시간 심박수</h2>
    {#if currentBpm !== null}
      <div class="bpm-value">{currentBpm} BPM</div>
      {#if lastUpdated}
        <small>마지막 업데이트: {new Date(lastUpdated * 1000).toLocaleTimeString()}</small>
      {/if}
    {:else}
      <div class="bpm-value">--</div>
      <small>심박수 데이터를 기다리는 중...</small>
    {/if}
  </div>

  <div class="search-card">
    <h2>곡 검색</h2>
    <div class="search-container">
      <input
        type="text"
        bind:value={queryText}
        placeholder="검색어를 입력하세요 (예: Big Bank)"
        on:keydown={(e) => {
          if (e.key === "Enter") handleSearch();
        }}
      />
      <button on:click={handleSearch} disabled={isSearching}>
        {#if isSearching}검색 중...{:else}검색{/if}
      </button>
    </div>
    {#if errorMessage}
      <p style="color: red; margin-top: 0.5rem;">{errorMessage}</p>
    {/if}
  </div>

  {#if recommendations.length > 0}
    <div class="rec-card">
      <h2>입력하신 곡과 유사한 추천 곡 목록</h2>
      <ul class="rec-list">
        {#each recommendations as rec (rec.index)}
          <li
            class="rec-item {rec.index === currentIndex ? 'selected' : ''}"
            on:click={() => playRecommendation(rec.index)}
          >
            <span>{rec.track_name}</span>
            {#if rec.videoId}
              <small>▶</small>
            {:else}
              <small>(영상 없음)</small>
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if currentVideoId}
    <div class="youtube-player">
      <div id="yt-player"></div>
    </div>
  {/if}
</div>
