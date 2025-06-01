// src/lib/spotify-api.js
/*
서버사이드에서 API를 호출하는거 아직 잘 모르겠어서 일단 유기하겠습니다... 어렵네요;;
*/

// 1) import.meta.env에서 VITE_SPOTIFY_TOKEN_ENDPOINT를 가져옵니다.
const SPOTIFY_TOKEN_ENDPOINT = import.meta.env.VITE_SPOTIFY_TOKEN_ENDPOINT;

/**
 * Firebase Function(getSpotifyToken)에 요청해서
 * Spotify Access Token을 받아오는 함수.
 */
export async function fetchSpotifyToken() {
  // 2) fetch()에 하드코딩된 URL 대신 환경 변수로 읽어온 엔드포인트를 사용
  if (!SPOTIFY_TOKEN_ENDPOINT) {
    throw new Error("VITE_SPOTIFY_TOKEN_ENDPOINT가 설정되지 않았습니다.");
  }

  // (디버깅 용도로 콘솔에 찍어볼 수도 있습니다.)
  console.log(">>> Spotify Token Fetcher Endpoint:", SPOTIFY_TOKEN_ENDPOINT);

  const res = await fetch(SPOTIFY_TOKEN_ENDPOINT);
  if (!res.ok) {
    const text = await res.text();
    throw new Error("Spotify 토큰 발급 실패: " + text);
  }
  const { access_token, expires_in } = await res.json();
  return access_token;
}

/**
 * 예시: 검색어(query)로 Spotify에서 트랙 검색
 */
export async function searchTrackByName(query) {
  // 1) 먼저 Spotify 토큰을 받아옴
  const token = await fetchSpotifyToken();

  // 2) 실제 검색 API 호출
  const response = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error("Spotify 검색 오류: " + errText);
  }

  const data = await response.json();
  // 트랙이 하나라도 있으면 items[0]을 리턴
  return data.tracks.items[0] || null;
}
