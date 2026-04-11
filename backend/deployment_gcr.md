# 🌍 Google Cloud Run 가입 및 배포 완벽 가이드

이 문서는 생전 처음 구글 클라우드를 접해보는 분들을 위해 작성되었습니다. 차근차근 따라오세요!

---

## 🏗️ 1단계: 구글 클라우드 계정 준비 (신분증/카드 필요)

1. **[구글 클라우드 콘솔](https://console.cloud.google.com/)**에 접속하여 구글 계정으로 로그인합니다.
2. **"무료로 시작하기"** 버튼을 눌러 약관에 동의합니다.
3. **결제 섹션**: 신용카드 혹은 체크카드를 등록합니다. (무료 티어 내에서는 결제되지 않으니 안심하세요!)
4. **프로젝트 생성**: 상단 메뉴에서 `새 프로젝트`를 누르고 이름(예: `fourcut-backend`)을 정해 생성합니다.

---

## 💻 2단계: 로컬 PC에 구글 클라우드 도구 설치

1. **[gcloud CLI 설치 페이지](https://cloud.google.com/sdk/docs/install?hl=ko)**에서 사용자님의 OS(Mac)에 맞는 설치 프로그램을 받아 설치합니다.
2. 터미널(Terminal)을 열고 다음 명령어를 입력하여 로그인합니다:
   ```bash
   gcloud auth login
   ```
3. 생성한 프로젝트를 기본값으로 설정합니다:
   ```bash
   gcloud config set project [사용자님의-프로젝트-아이디]
   ```

---

## 🚀 3단계: 명령어로 한 방에 배포하기 (마법의 명령어)

백엔드 폴더(`backend/`)로 이동한 뒤, 터미널에 다음 명령어를 복사해서 붙여넣으세요:

```bash
gcloud run deploy fourcut-backend \
  --source . \
  --region asia-northeast3 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --set-env-vars R2_ACCOUNT_ID=[상세값],R2_ACCESS_KEY_ID=[상세값],R2_SECRET_ACCESS_KEY=[상세값],R2_BUCKET_NAME=[상세값],R2_PUBLIC_URL=[상세값]
```

### 🏮 여기서 중요! (설정값 설명)
- `--region asia-northeast3`: 한국(서울) 서버를 사용하겠다는 뜻입니다. (지연 시간 최소화)
- `--memory 2Gi`: **제장 넉넉하게 2GB RAM**을 할당합니다. FFmpeg가 이제 숨을 쉴 수 있습니다!
- `--set-env-vars`: 기존 `.env` 파일에 있던 R2 설정값들을 직접 넣어주어야 합니다.

---

## ⚙️ 4단계: 마무리 및 프론트엔드 업데이트

1. 배포가 완료되면 `Service URL: https://fourcut-backend-xxxx.a.run.app` 과 같은 주소가 나옵니다.
2. 이 주소를 복사해서 **Vercel의 `NEXT_PUBLIC_API_URL`** 환경 변수 값으로 교체하세요.
3. Vercel을 다시 배포(Redeploy)하면 이제 모든 요청이 초고속 구글 서버로 흘러갑니다.

---

> [!TIP]
> **이사 완료 후의 변화**
> 이제 여러 명의 사용자가 동시에 "사진+영상" 버튼을 눌러도, 구글 클라우드가 자동으로 서버를 복제하여 처리합니다. 더 이상 502 Bad Gateway 에러를 걱정하지 않으셔도 됩니다! 🥳📸
