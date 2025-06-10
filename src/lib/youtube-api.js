// src/lib/youtube-api.js
const YT_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;

export async function searchYoutubeVideo(query) {
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=${encodeURIComponent(query)}&key=${YT_API_KEY}`);
  const data = await res.json();
  if (data.items && data.items.length > 0) {
    return data.items[0].id.videoId; // 첫 번째 비디오 ID
  } else {
    return null;
  }
}

export async function getThumbnailByVideoId(videoId) {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}` + `&key=${YT_API_KEY}`
  );
  const data = await res.json();
  if (data.items?.length > 0) {
    const thumbs = data.items[0].snippet.thumbnails;
    return thumbs.high?.url || thumbs.medium?.url || thumbs.default.url;
  }
  return null;
}