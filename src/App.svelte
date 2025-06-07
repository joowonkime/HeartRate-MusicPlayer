<script lang="ts">
  import { onMount } from "svelte";
  import {
    // State stores
    currentBpm,
    lastUpdated,
    queryText,
    foundTrack,
    player,
    playerReady,
    playlist,
    currentIndex,
    currentVideoId,
    songProgress,
    songDuration,
    songCurrentTime,
    isPlaying,
    allAudioFeatures,
    baseFeatures,
    recommendations,
    ambiguousMatches,
    userInputAssumption,
    isSearching,
    errorMessage,
    showLaunchScreen,
    showWelcomePage,
    showSignInPage,
    showPreferencesPage,
    showInstructionPage,
    showSensorPage,
    showHomePage,
    user,
    userPreferences,
    // Functions
    initializeApp,
    checkUserPreferences,
    saveUserPreferences,
    hybridDistance,
    buildRecommendations,
    getMoreRecommendations,
    continueToApp,

    continueFromInstructions,
    signInWithGoogle,
    signOutUser,
    updateEnergyLevel,
    selectPopularity,
    selectDanceability,
    selectSpeechiness,
    startMonitoring,
    initYouTubePlayer,
    onPlayerReady,
    trackProgress,
    onPlayerStateChange,
    togglePlayPause,
    playRecommendation,
    maybeLoadMoreRecommendations,
    handleSearch,
    searchByKey,
    skipToNext,
    // Types
    type TrackInfo,
    type AudioFeature,
    type Recommendation,
    isDemoMode,
    startDemoMode,
    stopDemoMode,
    setDemoHeartRate,
    simulateWorkout,
    demoWorkoutActive,
    startWorkoutDemo,
    stopWorkoutDemo
  } from "./AppLogic";

  // Auto-hide launch screen after 3 seconds
  onMount(() => {
    return initializeApp();
  });

  // Reactive statements for YouTube player initialization
  $: if ($currentVideoId && $playerReady) {
    initYouTubePlayer();
  }
</script>

<div class="mobile-container">
  {#if $showLaunchScreen}
    <div class="page-container">
      <div class="bg-blur bg-blur-main"></div>
      
      <div class="content-section flex-center" style="width: 300px; height: 300px; left: 66px; top: 213px;">
        <img src="/assets/heart-logo.svg" alt="HeartStream Logo" class="icon-medium icon-heart" />
      </div>

      <div class="content-section heading-large" style="left: 50%; top: 580px; transform: translateX(-50%);">HEARTSTREAM</div>
    </div>
  {:else if $showWelcomePage}
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
  {:else if $showSignInPage}
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
      <button class="btn-main-action" style="top: 714px; gap: 15px;" on:click={signInWithGoogle} type="button" aria-label="Sign in with Google">
        <img src="/assets/google.png" alt="Google" style="width: 28px; height: 28px; border-radius: 4px;" />
        Sign in with Google
      </button>
    </div>
  {:else if $showPreferencesPage}
    <div class="page-container">
      <!-- Background blur effect -->
      <div style="
        width: 266px; 
        height: 266px; 
        left: -41px; 
        bottom: -100px; 
        position: absolute; 
        background: var(--color-accent); 
        box-shadow: 300px 300px 300px; 
        border-radius: 50%; 
        filter: blur(150px);
      "></div>
      
      <!-- Page title -->
      <div class="content-section heading-medium" style="
        width: 277px; 
        left: 79px; 
        top: 100px;
      ">
        Save Your Preferences
      </div>
      
      <!-- Popularity Section -->
      <div class="heading-small" style="
        position: absolute; 
        top: 193px; 
        width: 350px; 
        left: 40px; 
        text-align: left;
      ">
        Popularity
      </div>
      
      <div class="text-small" style="
        position: absolute; 
        top: 223px; 
        width: 367px; 
        left: 40px; 
        text-align: left; 
        color: rgba(255, 255, 255, 0.70); 
        font-weight: 600;
      ">
        Do you vibe more with chart-toppers or hidden gems?
      </div>
      
      <button 
        class="option-toggle {$userPreferences.popularity === 'chart-toppers' ? 'selected' : ''}" 
        style="
          width: 163px; 
          height: 34px; 
          top: 260px; 
          left: 41px;
        " 
        on:click={() => selectPopularity('chart-toppers')} 
        type="button" 
        aria-label="Select chart-toppers" 
        aria-pressed={$userPreferences.popularity === 'chart-toppers'}
      >
        Chart-Toppers
      </button>
      
      <button 
        class="option-toggle {$userPreferences.popularity === 'hidden-gems' ? 'selected' : ''}" 
        style="
          width: 163px; 
          height: 34px; 
          top: 260px; 
          left: 230px;
        " 
        on:click={() => selectPopularity('hidden-gems')} 
        type="button" 
        aria-label="Select hidden gems" 
        aria-pressed={$userPreferences.popularity === 'hidden-gems'}
      >
        Hidden Gems
      </button>
      
      <!-- Danceability Section -->
      <div class="heading-small" style="
        position: absolute; 
        top: 330px; 
        width: 350px; 
        left: 40px; 
        text-align: left;
      ">
        Danceability
      </div>
      
      <div class="text-small" style="
        position: absolute; 
        top: 364px; 
        width: 367px; 
        left: 40px; 
        text-align: left; 
        color: rgba(255, 255, 255, 0.70); 
        font-weight: 600;
      ">
        How much groove do you want in your music?
      </div>
      
      <div style="
        position: absolute; 
        top: 401px; 
        width: 335px; 
        left: 50px; 
        display: flex; 
        justify-content: flex-start; 
        align-items: center; 
        gap: 45px;
      ">
        {#each Array(5) as _, i}
          <button 
            class="rating-control {$userPreferences.danceability === i + 1 ? 'selected' : ''}" 
            on:click={() => selectDanceability(i + 1)} 
            type="button" 
            aria-label="Select danceability level {i + 1}" 
            aria-pressed={$userPreferences.danceability === i + 1}
          ></button>
        {/each}
      </div>
      
      <div class="text-small" style="
        position: absolute; 
        top: 445px; 
        width: 120px; 
        left: 50px; 
        text-align: left; 
        color: rgba(255, 255, 255, 0.70); 
        font-weight: 600;
      ">
        Mild groove
      </div>
      
      <div class="text-small" style="
        position: absolute; 
        top: 445px; 
        width: 120px; 
        right: 50px; 
        text-align: right; 
        color: rgba(255, 255, 255, 0.70); 
        font-weight: 600;
      ">
        Dancefloor-ready
      </div>
      
      <!-- Speechiness Section -->
      <div class="heading-small" style="
        position: absolute; 
        top: 494px; 
        width: 350px; 
        left: 40px; 
        text-align: left;
      ">
        Speechness
      </div>
      
      <div class="text-small" style="
        position: absolute; 
        top: 528px; 
        width: 367px; 
        left: 40px; 
        text-align: left; 
        color: rgba(255, 255, 255, 0.70); 
        font-weight: 600;
      ">
        Do you like lyric-heavy songs or more instrumental vibes?
      </div>
      
      <div style="
        position: absolute; 
        top: 565px; 
        width: 335px; 
        left: 50px; 
        display: flex; 
        justify-content: flex-start; 
        align-items: center; 
        gap: 45px;
      ">
        {#each Array(5) as _, i}
          <button 
            class="rating-control {$userPreferences.speechiness === i + 1 ? 'selected' : ''}" 
            on:click={() => selectSpeechiness(i + 1)} 
            type="button" 
            aria-label="Select speechiness level {i + 1}" 
            aria-pressed={$userPreferences.speechiness === i + 1}
          ></button>
        {/each}
      </div>
      
      <div class="text-small" style="
        position: absolute; 
        top: 609px; 
        width: 120px; 
        left: 50px; 
        text-align: left; 
        color: rgba(255, 255, 255, 0.70); 
        font-weight: 600;
      ">
        Instrumental
      </div>
      
      <div class="text-small" style="
        position: absolute; 
        top: 609px; 
        width: 120px; 
        right: 50px; 
        text-align: right; 
        color: rgba(255, 255, 255, 0.70); 
        font-weight: 600;
      ">
        Lyric-focused
      </div>
      
      <!-- Energy Section -->
      <div class="heading-small" style="
        position: absolute; 
        top: 658px; 
        width: 350px; 
        left: 40px; 
        text-align: left;
      ">
        Energy
      </div>
      
      <div class="text-small" style="
        position: absolute; 
        top: 692px; 
        width: 367px; 
        left: 40px; 
        text-align: left; 
        color: rgba(255, 255, 255, 0.70); 
        font-weight: 600;
      ">
        How intense do you want your music to feel?
      </div>
      
      <div class="slider-track" style="
        width: 351px; 
        height: 12px; 
        left: 41px; 
        top: 740px;
      ">
        <input 
          type="range" 
          min="0" 
          max="1" 
          step="0.1" 
          bind:value={$userPreferences.energy} 
          on:input={updateEnergyLevel} 
          class="slider-input" 
        />
      </div>
      
      <div class="text-small" style="
        position: absolute; 
        top: 770px; 
        width: 120px; 
        left: 50px; 
        text-align: left; 
        color: rgba(255, 255, 255, 0.70); 
        font-weight: 600;
      ">
        Laid-back
      </div>
      
      <div class="text-small" style="
        position: absolute; 
        top: 770px; 
        width: 120px; 
        right: 50px; 
        text-align: right; 
        color: rgba(255, 255, 255, 0.70); 
        font-weight: 600;
      ">
        Heavy metal
      </div>
      
      <!-- Continue Button -->
      <button 
        class="btn-main-action" 
        on:click={saveUserPreferences} 
        type="button" 
        aria-label="Save preferences and continue"
      >
        Continue
      </button>
    </div>
  {:else if $showInstructionPage}
    <div class="page-container">
      <!-- Background -->
      <div style="width: 100%; height: 100%; background: #1A1A1A; position: absolute;"></div>
      
      <!-- Main Heading -->
      <div style="position: absolute; top: 90px; left: 40px; width: 350px;">
        <h1 style="color: var(--color-text); font-size: 32px; font-family: var(--font-system); font-weight: 700; line-height: 1.2; margin: 0; letter-spacing: -0.5px;">
          READY TO GET<br/>SYNCED?
        </h1>
      </div>

      <!-- Description Text -->
      <div style="position: absolute; top: 200px; left: 40px; width: 350px;">
        <p style="color: rgba(255, 255, 255, 0.8); font-size: 16px; font-family: var(--font-system); font-weight: 400; line-height: 1.5; margin: 0;">
          Before we get started, please look at how HeartStream works. Your heart rate will be used to create the perfect music experience for you.
        </p>
      </div>

      <!-- Video/Image Container -->
      <div style="position: absolute; top: 320px; left: 40px; width: 350px; height: 200px; background: #2A2A2A; border-radius: 12px; overflow: hidden; display: flex; align-items: center; justify-content: center;">
        <!-- Heart to Music SVG -->
        <div style="display: flex; flex-direction: column; align-items: center; gap: 16px;">
          <img src="/assets/heart-to-music.png" alt="Heart Rate to Music Flow" style="width: 260px; height: auto; opacity: 0.9;" />
        </div>
      </div>

      <!-- Checklist/Steps -->
      <div style="position: absolute; top: 560px; left: 40px; width: 350px;">
        <h3 style="color: var(--color-text); font-size: 18px; font-family: var(--font-system); font-weight: 600; margin: 0 0 20px 0;">
          How it works:
        </h3>
        
        <!-- Step 1 -->
        <div class="instruction-step">
          <div class="step-checkmark"></div>
          <div class="step-text">
            Place finger on sensor for heart rate reading. Keep it still for accurate readings.
          </div>
        </div>

        <!-- Step 2 -->
        <div class="instruction-step">
          <div class="step-checkmark"></div>
          <div class="step-text">
            HeartStream analyzes your BPM and preferences.
          </div>
        </div>

        <!-- Step 3 -->
        <div class="instruction-step">
          <div class="step-checkmark"></div>
          <div class="step-text">
            Perfect music playlist is generated automatically.
          </div>
        </div>
      </div>

      <!-- Continue Button -->
      <button class="btn-main-action" on:click={continueFromInstructions} type="button" aria-label="Continue to sensor connection">
        Next
      </button>
    </div>
  {:else if $showSensorPage}
    <div class="page-container">
      <div style="width: 266px; height: 266px; left: 84px; top: 297px; background: rgba(255, 34.61, 75.02, 0.60); position: absolute; box-shadow: 300px 300px 300px; border-radius: 50%; filter: blur(150px);"></div>
      
      <!-- Pulsing red ellipse -->
      <div style="width: 80px; height: 80px; left: 50%; top: 400px; transform: translateX(-50%); background: var(--color-accent); border-radius: 50%; position: absolute; animation: sensorPulse 2s infinite ease-in-out; filter: blur(20px); opacity: 0.1;"></div>
      
      <div class="content-section heading-medium" style="width: 277px; left: 79px; top: 121px;">
        Connect to Sensor
      </div>
      <img src="/assets/sensor.png" alt="Heart Rate Sensor" style="width: 180px; height: 180px; left: 131px; top: 322px; position: absolute; opacity: 0.8;" />
      <div class="content-section text-medium" style="width: 268px; left: 87px; top: 563px; color: rgba(229, 229, 229, 0.90); font-size: 18px; font-weight: 400;">
        Place your finger on the sensor
      </div>
      <button class="btn-main-action" on:click={startMonitoring} type="button" aria-label="Start monitoring heart rate">
        Start Monitoring
      </button>
    </div>
  {:else if $showHomePage}
    <div class="page-container">
      <!-- Decorative red blur background -->
      <div style="
        width: 200px; 
        height: 200px; 
        left: -70px; 
        top: -70px; 
        position: absolute; 
        background: var(--color-accent); 
        box-shadow: 200px 200px 200px; 
        border-radius: 50%; 
        filter: blur(100px);
      "></div>
      
      <!-- Header Section -->
      <div class="user-welcome">Welcome</div>
      <div class="user-name">{$user?.displayName || 'User'}</div>
      <img 
        class="user-avatar" 
        src="{$user?.photoURL || 'https://placehold.co/34x34'}" 
        alt="User Avatar" 
      />
      
      <button 
        class="signout-button" 
        on:click={signOutUser} 
        type="button" 
        aria-label="Sign out"
      >
        <div class="signout-background"></div>
        <div class="signout-text">sign out</div>
      </button>
      
      <!-- Heart Rate Display Section -->
      <div class="heart-rate-label">Your Current Heart Rate is</div>
      <div class="heart-rate-container"></div>
      <div class="heart-rate-value">{$currentBpm || '--'}</div>
      <div class="timestamp">
        Last Update: {$lastUpdated ? new Date($lastUpdated).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' }) : 'No data'}
      </div>
      
      <!-- Music Search Section -->
      <div class="section-heading">Choose a song to start with</div>
      <div class="search-container"></div>
      <input 
        class="search-input" 
        bind:value={$queryText}
        placeholder="Browse Library"
        on:keydown={(e) => e.key === 'Enter' && handleSearch()}
      />
      <button 
        class="search-button" 
        on:click={handleSearch} 
        type="button" 
        aria-label="Search for music"
      >
        <div class="search-icon"></div>
      </button>
      
      <!-- ECG Wave Visualization -->
      <div class="ecg-line">
        <div class="ecg-grid"></div>
        <div class="ecg-wave"></div>
      </div>
      
      <!-- Music Player - Always visible -->
      <div class="music-player">
        <div class="player-top-section"></div>
        <div class="player-bottom-section"></div>
        <div class="player-divider"></div>
        
        <button 
          class="play-pause-button" 
          on:click={togglePlayPause} 
          type="button" 
          aria-label="{$isPlaying ? 'Pause' : 'Play'} music"
        >
          <div class="play-pause-icon {$isPlaying ? 'pause' : 'play'}"></div>
        </button>
        
        <button 
          class="skip-button" 
          on:click={skipToNext} 
          type="button" 
          aria-label="Skip to next song"
        >
          <div class="skip-icon">⏭</div>
        </button>
        
        <div class="track-title">
          {$foundTrack?.name || 'MUSIC NAME'}
        </div>
        
        <div class="track-artist">
          {$foundTrack?.artist || 'Artist Name'}
        </div>
        
        <div class="progress-bar">
          <div class="progress-fill" style="width: {$songProgress}%"></div>
        </div>
      </div>
      
      <!-- YouTube Player (hidden) -->
      <div id="yt-player" style="display: none;"></div>
      
      <!-- Song Disambiguation Interface -->
      {#if $ambiguousMatches.length > 0}
        <div class="disambiguation-overlay">
          <div class="disambiguation-header">
            <h3>Multiple songs found for "{$queryText}"</h3>
            <p>Please select the correct song:</p>
          </div>
          
          <div class="disambiguation-list">
            {#each $ambiguousMatches as match}
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
          
          <button 
            class="disambiguation-close" 
            on:click={() => ambiguousMatches.set([])} 
            aria-label="Close disambiguation"
          >
            Cancel
          </button>
        </div>
      {/if}
      
      <!-- Recommendations List -->
      {#if $recommendations.length > 0 && $ambiguousMatches.length === 0}
        <div class="recommendations-overlay">
          <div class="recommendations-header">
            <h3>Up Next</h3>
            <button 
              on:click={() => recommendations.set([])} 
              aria-label="Close recommendations"
            >
              ×
            </button>
          </div>
          
          <div class="recommendations-list">
            {#each $recommendations as rec, idx}
              <button 
                class="recommendation-item {$currentIndex === idx ? 'playing' : ''}"
                on:click={() => playRecommendation(idx)}
                type="button"
                aria-label="Play {rec.track_name} by {rec.artist_name}"
              >
                <div class="track-info">
                  <span class="track-full">
                    {#if rec.index === 0}✦ {/if}{rec.track_name} - {rec.artist_name}
                  </span>
                </div>
                
                {#if $currentIndex === idx}
                  <span class="playing-indicator">♪</span>
                {:else}
                  <span class="play-button">▶</span>
                {/if}
              </button>
            {/each}
          </div>
        </div>
      {/if}
      
      <!-- Search Loading State -->
      {#if $isSearching}
        <div class="search-loading">
          <div class="loading-spinner"></div>
          <p>Finding perfect music for your vibe...</p>
        </div>
      {/if}
      
      <!-- Error Message -->
      {#if $errorMessage}
        <div class="error-message">
          <p>{$errorMessage}</p>
          <button on:click={() => errorMessage.set(null)}>Dismiss</button>
        </div>
      {/if}
      
      <!-- Demo Controls (always visible when demo mode is active) -->
      {#if $isDemoMode}
        <div class="demo-controls-compact">
          <div class="demo-header-compact">
            <span class="demo-status">
              {#if $demoWorkoutActive}
                🏃‍♂️ Workout Demo
              {:else}
                Demo Mode Active
              {/if}
            </span>
            <button class="demo-close-btn" on:click={stopDemoMode} aria-label="Exit demo mode">×</button>
          </div>
          
          <div class="demo-action">
            {#if $demoWorkoutActive}
              <button class="demo-btn-stop" on:click={stopWorkoutDemo}>
                Stop Workout Demo
              </button>
            {:else}
              <button class="demo-btn-start" on:click={startWorkoutDemo}>
                Start Workout Demo
              </button>
            {/if}
          </div>
          
          <div class="demo-info">
            <p>🎵 Watch the playlist adapt as heart rate changes!</p>
          </div>
        </div>
      {:else}
        <button class="quick-demo-btn" on:click={startDemoMode}>
          Quick Demo
        </button>
      {/if}
    </div>
  {/if}
</div>
