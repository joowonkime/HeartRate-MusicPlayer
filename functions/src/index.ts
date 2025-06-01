/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

// import {onRequest} from "firebase-functions/v2/https";
// import * as logger from "firebase-functions/logger";

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// export const helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

// functions/src/index.ts

// functions/src/index.ts

import * as functions from "firebase-functions";
import fetch from "node-fetch";

/**
 * Spotify에서 발급받는 토큰의 JSON 형태를 정의합니다.
 */
interface SpotifyTokenResponse {
  access_token: string;
  expires_in: number;
}

// Firebase Functions Config에 저장된 값 읽기
const SPOTIFY_CLIENT_ID = functions.config().spotify?.id;
const SPOTIFY_CLIENT_SECRET = functions.config().spotify?.secret;

if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
  console.warn(
    "⚠️ Warning: Spotify Client ID/Secret이 설정되지 않았습니다.\n" +
      "   firebase functions:config:set spotify.id=\"...\" spotify.secret=\"...\""
  );
}

/**
 * HTTPS 엔드포인트: /getSpotifyToken
 * Spotify Client Credentials Flow를 통해 토큰을 발급받아 클라이언트에 반환합니다.
 *
 * ★ 핵심 포인트
 * 1) async 콜백에서 res.json(...)을 바로 return 하지 않고, 
 *     res.json(...) 호출 후 void 반환 → Promise<void> 타입을 맞춤
 * 2) tokenJson의 타입을 `SpotifyTokenResponse`로 단언(타입 캐스팅)
 */
export const getSpotifyToken = functions.https.onRequest(
  async (req, res): Promise<void> => {
    // 1) 환경 변수 확인
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
      res.status(500).json({ error: "Spotify credentials not configured." });
      return;
    }

    try {
      // 2) Basic 인증용 문자열 생성
      const basicAuth = Buffer.from(
        `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`
      ).toString("base64");

      // 3) Spotify에 Token 발급 요청
      const tokenResponse = await fetch(
        "https://accounts.spotify.com/api/token",
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${basicAuth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: "grant_type=client_credentials",
        }
      );

      if (!tokenResponse.ok) {
        // 3-1) 요청이 실패한 경우, 에러 메시지를 읽어와서 그대로 반환
        const errText = await tokenResponse.text();
        console.error("Spotify Token 요청 오류:", errText);
        res.status(tokenResponse.status).json({ error: errText });
        return;
      }

      // 4) JSON 파싱 및 타입 단언
      const tokenJson = (await tokenResponse.json()) as SpotifyTokenResponse;

      // 5) 클라이언트에 JSON 형태로 응답
      res.json({
        access_token: tokenJson.access_token,
        expires_in: tokenJson.expires_in,
      });
      return; // async 함수가 void를 반환하도록 명시적으로 종료
    } catch (err) {
      console.error("getSpotifyToken 내부 예외 발생:", err);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }
  }
);

