# 💸 Render.com 백엔드 무료 배포 완벽 가이드

이 문서는 사용자님의 백엔드를 **Render.com**의 무료 티어에 배포하여 평생(?) 0원으로 운영하기 위한 매뉴얼입니다.

---

## 🏗️ 1단계: Render.com 서비스 생성

1. **[Render.com](https://render.com/)**에 접속하여 깃허브(GitHub) 계정으로 로그인합니다.
2. 대시보드에서 **[+ New]** -> **[Web Service]**를 선택합니다.
3. 사용자님의 **`4cut`** 저장소(Repository)를 연결합니다.
4. 아래와 같이 설정을 입력합니다:
   - **Name**: `fourcut-backend` (또는 원하는 이름)
   - **Region**: `Singapore (Southeast Asia)` (한국과 가장 가까워 빠릅니다)
   - **Branch**: `main`
   - **Root Directory**: `backend` (반드시 `backend`로 지정해야 합니다!)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: **[Free]** (0원 확인!)

---

## 🔑 2단계: 환경 변수(Environment Variables) 설정

배포 설정 하단의 **[Advanced]** 또는 사이드바의 **[Environment]** 메뉴에서 아래 값들을 추가해 주세요. (로컬 `.env` 파일에 있는 값들을 복사해 넣으시면 됩니다.)

| Key | Value (내용) |
| --- | --- |
| `R2_ACCOUNT_ID` | `3951114ac8cb013f4bd1759894bb2952` |
| `R2_ACCESS_KEY_ID` | `53030f7c5ab8bccccad67b7a81a017e3` |
| `R2_SECRET_ACCESS_KEY` | `6dee324...` (비밀키 전체) |
| `R2_BUCKET_NAME` | `4cut-photos` |
| `R2_PUBLIC_URL` | `https://pub-1bb31f7...r2.dev` |

> [!TIP]
> **중요**: Render 무료 티어는 15분간 요청이 없으면 서버가 잠이 듭니다. 첫 접속 시 깨어나는 데 약 30초가 걸릴 수 있으니, "왜 안 되지?" 하지 마시고 잠시만 기다려 주세요! 👹

---

## 🔗 3단계: Vercel 프론트엔드와 연결

1. Render 배포가 완료되면 상단에 `https://fourcut-backend-xxxx.onrender.com` 주소가 나옵니다.
2. 이 주소를 복사해서 **Vercel 프로젝트 설정**의 **Environment Variables**로 이동합니다.
3. `NEXT_PUBLIC_API_URL` 값을 방금 복사한 **Render 주소**로 업데이트합니다.
4. Vercel에서 **[Redeploy]**를 실행하면 모든 연동이 끝납니다! 🥳

---

### 🏮 관리자 꿀팁
- 이제 사진/영상 합성은 사용자 브라우저가 직접 하므로 백엔드 부하가 거의 없습니다.
- 만약 접속이 너무 느리다면, Render 대시보드에서 가끔 수동으로 **[Clear Build Cache & Deploy]**를 눌러주세요.

이제 돈 걱정 없이 나만의 네컷 사진 서비스를 운영해 보세요! 👺🚀✨📸
