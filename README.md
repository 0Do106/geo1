# 영도쌤과 함께하는 작도교실

중학교 1학년 수학 **기본도형과 작도** 단원용 상호작용 웹앱입니다. 학생은 화면 속 투명 눈금 없는 자와 컴퍼스를 실제 도구처럼 이동·회전하고, 같은 길이의 선분과 같은 크기의 각을 작도한 뒤 자유 연습과 10문항 형성평가를 수행할 수 있습니다.

학생용 화면은 `index.html` 하나에 HTML, CSS, JavaScript가 모두 포함되어 있습니다. 서버 없이 열면 체험 모드로 작동하고, Node.js·Express·SQLite 서버를 실행하면 학급별 평가 결과, 리더보드, 교사 관리, CSV 및 Excel 다운로드가 활성화됩니다.

## 1. 이번 버전의 핵심 개선

### 실제 도구 조작감

- 반투명 아크릴 몸체, 손잡이, 그리기 모서리가 구분된 **눈금 없는 자**
- 눈금은 표시하지 않으면서 실제 자처럼 이동·회전·모서리 따라 긋기 가능
- 금속 다리, 회전 손잡이, 바늘, 나무 연필, 흑연심이 구분된 **컴퍼스**
- 빨간 표시의 바늘 끝과 청록 표시의 연필 끝을 화면에서 즉시 구분
- 컴퍼스 바늘을 중심에 놓고 연필 끝을 끌어 폭을 정한 뒤 직접 회전
- 330° 이상 회전하면 원, 그보다 작은 범위는 호로 생성
- 연필 질감과 볼펜 질감을 선택할 수 있는 선 표현
- 정확한 수학 좌표는 유지하면서 SVG 필터로 손으로 그린 듯한 시각 효과 제공

### 도구 조작 연습

`자와 컴퍼스` 화면에 별도의 연습 코스가 있습니다.

- 자 선택 → 몸체 이동 → 손잡이 회전 → 모서리 따라 긋기
- 컴퍼스 선택 → 바늘로 중심 지정 → 연필로 폭 조정 → 회전 그리기 → 호 → 원
- 현재 해야 할 조작을 단계별로 표시
- 원 그리기 4단계 설명 상시 제공
- 자유 실험에서 연필선, 볼펜선, 획 지우기, 부분 지우개 연습

### 지우개

- **획 지우기:** 선분, 직선, 반직선, 원, 호, 자유선 한 획을 눌러 전체 삭제
- **부분 지우개:** 자유선을 문질러 닿은 부분만 삭제
- 정확한 작도 객체에 부분 지우개가 닿으면 해당 객체 한 개 삭제
- **선택 삭제:** 선택한 객체 삭제
- **전체 지우기:** 현재 작업 영역 초기화
- **실행 취소/다시 실행:** 잘못 지운 결과 복구 가능

### 교사용 기록

- 학급별 전체 응시 기록
- 학생별 최고 기록 리더보드
- CSV 다운로드
- 실제 `.xlsx` 형식의 Excel 다운로드
- Excel 첫 행 고정, 자동 필터, 한글 열 제목, 날짜 형식, 줄무늬 행 적용
- 문항별 목표값·학생 결과값·오차·점수 포함

## 2. 전체 기능

### 학생 기능

- 작도의 의미와 눈금 없는 자·컴퍼스 역할 설명
- 올바른 도구 사용과 잘못된 사용 비교 및 미니 퀴즈
- SVG 기반 점, 선분, 직선, 반직선, 원, 호, 교점 객체
- 선-선, 선-원, 원-원 교점의 수학적 계산
- 자동 스냅, 확대/축소, 화면 맞춤, 점 이름과 보조선 표시
- 같은 길이의 선분 복사 안내형 작도
- 같은 크기의 각 복사 안내형 작도
- 4단계 힌트 난이도
- 자유 연습과 길이·각도 오차 판정
- 선분 5문항과 각 5문항의 10문항 형성평가
- 서버 장애 시 브라우저 임시 저장 및 재전송 대기열
- 교사 시범 모드와 전체 화면

### 서버·교사 기능

- 학급별 평가 결과 저장
- 학생별 최고 기록 리더보드
- 관리자 아이디와 bcrypt 비밀번호 해시 인증
- 만료 시간이 있는 JWT 관리자 토큰
- 결과 검색·정렬·삭제·학급 전체 초기화
- 평가 열기/닫기, 리더보드 공개, 채점 방식, 허용 오차 설정
- CSV와 Excel 다운로드
- 서버가 문항별 점수를 다시 계산하여 클라이언트 총점을 신뢰하지 않음
- 입력값 검증, 요청 횟수 제한, CORS 제한, 보안 헤더
- SQLite prepared statement를 통한 SQL Injection 방지

## 3. 파일 구조

```text
geometry_construction_classroom/
├─ index.html          # 학생 화면과 교사 관리 SPA
├─ server.js           # Express REST API와 SQLite 처리
├─ package.json        # Node.js 패키지 및 실행 명령
├─ .env.example        # 환경변수 예시
├─ .gitignore          # 비밀번호·DB·node_modules Git 제외
├─ render.yaml         # Render 전체 서버 배포 예시
├─ README.md
└─ data/               # 로컬 첫 실행 시 자동 생성
   └─ construction-classroom.db
```

## 4. 권장 환경

- Node.js 20 이상
- Chrome 또는 Edge 최신 버전 권장
- 학생용 노트북, 태블릿, 터치 디스플레이
- 정확한 작도를 위해 가로 폭 760px 이상 권장

## 5. 서버 없이 체험하기

1. `index.html`을 더블클릭합니다.
2. 개념 학습, 도구 연습, 따라하기, 자유 연습, 형성평가를 사용할 수 있습니다.
3. 상단에는 **로컬 체험 모드**가 표시됩니다.
4. 형성평가 결과는 해당 브라우저에 임시 저장됩니다.
5. 다른 기기와 리더보드가 공유되지는 않습니다.

## 6. Windows에서 서버 설치

### 6-1. Node.js 확인

PowerShell을 열고 실행합니다.

```powershell
node -v
npm -v
```

### 6-2. 프로젝트 폴더 이동

예를 들어 `C:\construction-classroom`에 압축을 풀었다면:

```powershell
cd C:\construction-classroom
```

### 6-3. 패키지 설치

```powershell
npm install
```

`better-sqlite3` 설치 오류가 생기면 Node.js LTS 버전을 사용하고 새 PowerShell에서 다시 실행합니다.

## 7. 관리자 아이디와 비밀번호 설정

관리자 계정은 회원가입 방식이 아닙니다. 서버의 `.env` 파일에서 교사가 직접 설정합니다.

### 7-1. `.env` 만들기

```powershell
Copy-Item .env.example .env
```

### 7-2. 관리자 아이디 정하기

`.env`에서 다음 값을 수정합니다.

```env
ADMIN_USERNAME=teacher
```

예:

```env
ADMIN_USERNAME=youngdo_math
```

관리자 아이디에는 영문, 숫자, `_`, `-`, `.`만 사용할 수 있으며 최대 40자입니다.

### 7-3. 비밀번호 해시 만들기

```powershell
npm run hash-password -- 원하는관리자비밀번호
```

출력된 `$2b$12$...` 전체 문자열을 `.env`에 넣습니다.

```env
ADMIN_PASSWORD_HASH=$2b$12$출력된_전체_해시
```

비밀번호 원문은 소스 코드나 `.env`에 적지 않습니다. `.env`에는 해시만 저장합니다.

### 7-4. JWT 비밀키 설정

```env
JWT_SECRET=32자_이상의_예측하기_어려운_문자열
```

PowerShell에서 임의 값 예시를 만들 수 있습니다.

```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

### 7-5. 완성된 `.env` 예시

```env
HOST=0.0.0.0
PORT=3000
DB_PATH=./data/construction-classroom.db
ADMIN_USERNAME=youngdo_math
JWT_SECRET=충분히_긴_임의_문자열
ADMIN_PASSWORD_HASH=$2b$12$생성한_bcrypt_해시
TOKEN_EXPIRES_IN=4h
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,null
PUBLIC_RATE_LIMIT=120
SUBMIT_RATE_LIMIT=20
ADMIN_RATE_LIMIT=40
```

`.env`는 `.gitignore`에 포함되어 있으므로 GitHub에 올리지 않습니다.

## 8. 서버 실행

```powershell
npm start
```

정상 실행 예시:

```text
영도쌤 작도교실 서버: http://localhost:3000
데이터베이스: C:\...\data\construction-classroom.db
```

교사 컴퓨터에서 접속:

```text
http://localhost:3000
```

## 9. 같은 교실 네트워크에서 접속

교사 컴퓨터에서:

```powershell
ipconfig
```

현재 Wi-Fi 또는 이더넷의 IPv4 주소가 `192.168.0.25`라면 학생은 다음 주소로 접속합니다.

```text
http://192.168.0.25:3000
```

Windows Defender 방화벽이 묻는 경우 Node.js의 **개인 네트워크** 통신을 허용합니다. 학교 무선망에서 기기 간 통신이 차단되어 있다면 클라우드 배포를 사용해야 합니다.

## 10. `API_BASE_URL` 설정

`index.html`의 설정 객체는 다음과 같습니다.

```javascript
const APP_CONFIG = {
  API_BASE_URL: location.protocol === 'file:'
    ? 'http://localhost:3000'
    : window.location.origin,
  DEFAULT_CLASS_CODE: '',
  DEMO_MODE: false,
  LENGTH_TOLERANCE_PERCENT: 1.5,
  ANGLE_TOLERANCE_DEGREES: 1.5,
  SNAP_PX: 14,
  AUTO_SAVE_INTERVAL_MS: 2500
};
```

- Express 서버가 `index.html`도 함께 제공하면 수정할 필요가 없습니다.
- GitHub Pages와 별도 Render 서버를 조합할 때는 다음처럼 Render 주소를 직접 넣습니다.

```javascript
API_BASE_URL: 'https://내-서비스이름.onrender.com'
```

그리고 Render의 `ALLOWED_ORIGINS`에 GitHub Pages 주소를 추가합니다.

```env
ALLOWED_ORIGINS=https://내아이디.github.io
```

여러 주소는 쉼표로 구분합니다.

## 11. 원 그리는 방법

1. 도구 모음에서 **컴퍼스**를 선택합니다.
2. **① 바늘·폭 맞추기** 상태에서 빨간 바늘 끝을 중심에 둡니다.
3. 연필 끝을 끌어 원하는 반지름으로 벌립니다.
4. **② 연필 회전 그리기**를 누릅니다.
5. 바늘은 움직이지 않고 연필 끝을 누른 채 중심 주위로 한 바퀴 끕니다.
6. 약 330° 이상 회전하면 원으로 확정됩니다.
7. 한 바퀴보다 적게 돌리면 호로 확정됩니다.

도구 조작이 익숙하지 않으면 `자와 컴퍼스 → 컴퍼스·원 연습`을 먼저 수행합니다.

## 12. Excel과 CSV 다운로드

1. **교사 관리**로 이동합니다.
2. `.env`에 설정한 관리자 아이디와 비밀번호로 로그인합니다.
3. 학급 코드를 입력하고 **결과 조회**를 누릅니다.
4. 다음 중 하나를 선택합니다.
   - **Excel(.xlsx) 다운로드**: Excel에서 바로 열 수 있는 실제 XLSX 파일
   - **CSV 다운로드**: UTF-8 BOM CSV 파일

Excel과 CSV에 포함되는 열:

- 학급 코드
- 학생 별명
- 점수
- 정답 수
- 총 시간
- 제출 시각
- 선분 점수
- 각 점수
- 문항별 목표값·학생 결과값·오차·점수

## 13. 데이터베이스 백업

기본 데이터베이스:

```text
data\construction-classroom.db
```

안전한 백업 방법:

1. 서버 터미널에서 `Ctrl + C`로 서버를 종료합니다.
2. `data` 폴더 전체를 복사합니다.

```powershell
New-Item -ItemType Directory -Force .\backup
Copy-Item .\data .\backup\data-2026-07-24 -Recurse
```

복구할 때도 서버를 종료하고 백업 파일을 원래 `data` 폴더에 복사합니다.

## 14. 관리자 계정 변경

### 아이디 변경

`.env`의 `ADMIN_USERNAME`을 바꾸고 서버를 재시작합니다.

### 비밀번호 변경

```powershell
npm run hash-password -- 새로운비밀번호
```

새 해시를 `ADMIN_PASSWORD_HASH`에 넣고 서버를 재시작합니다.

기존 로그인 토큰까지 모두 무효화하려면 `JWT_SECRET`도 새 값으로 바꿉니다.

## 15. GitHub에 올리기

### 방법 A: GitHub Desktop

1. GitHub Desktop을 설치하고 로그인합니다.
2. `File → Add local repository`에서 프로젝트 폴더를 선택합니다.
3. 저장소가 아니라는 메시지가 나오면 `create a repository`를 선택합니다.
4. `.env`와 `data`가 변경 목록에 나타나지 않는지 확인합니다.
5. `Publish repository`를 누릅니다.
6. 학생에게 코드를 공개할 필요가 없다면 `Keep this code private`를 유지합니다.

### 방법 B: PowerShell과 Git

GitHub에서 빈 저장소를 먼저 만든 뒤 프로젝트 폴더에서 실행합니다.

```powershell
git init
git add .
git commit -m "영도쌤 작도교실 v1.1"
git branch -M main
git remote add origin https://github.com/내아이디/저장소이름.git
git push -u origin main
```

중요:

- `.env`를 GitHub에 올리지 않습니다.
- `data`와 SQLite 파일을 GitHub에 올리지 않습니다.
- 이미 `.env`를 실수로 커밋했다면 비밀번호와 JWT 비밀키를 즉시 변경해야 합니다.

## 16. GitHub Pages로 학생 화면만 배포

GitHub Pages는 `index.html`, CSS, JavaScript 같은 정적 파일은 배포할 수 있지만 이 프로젝트의 Node.js 서버와 SQLite는 실행하지 못합니다. 따라서 Pages만 사용하면 로컬 체험 모드이며 공유 리더보드와 교사 관리가 작동하지 않습니다.

1. GitHub 저장소의 `Settings`로 이동합니다.
2. 왼쪽 메뉴에서 `Pages`를 선택합니다.
3. `Build and deployment → Source`를 `Deploy from a branch`로 선택합니다.
4. 브랜치는 `main`, 폴더는 `/(root)`를 선택하고 저장합니다.
5. 배포가 완료되면 표시되는 주소로 접속합니다.

공유 리더보드까지 사용하려면 다음 절의 Render 서버와 연결합니다.

## 17. GitHub 저장소를 Render에 전체 배포

이 방식은 Express가 학생 화면과 API를 같은 주소에서 제공합니다. 가장 간단한 전체 기능 배포 방식입니다.

### 17-1. Render 연결

1. Render에 로그인합니다.
2. `New → Blueprint` 또는 `New → Web Service`를 선택합니다.
3. GitHub 계정을 연결하고 이 저장소를 선택합니다.
4. 프로젝트에 포함된 `render.yaml`을 사용할 수 있습니다.

수동 설정 값:

```text
Runtime: Node
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
```

### 17-2. 환경변수

Render 대시보드에서 다음을 설정합니다.

```env
ADMIN_USERNAME=youngdo_math
ADMIN_PASSWORD_HASH=$2b$12$생성한_해시
JWT_SECRET=충분히_긴_임의값
TOKEN_EXPIRES_IN=4h
ALLOWED_ORIGINS=https://내서비스.onrender.com
DB_PATH=/var/data/construction-classroom.db
```

### 17-3. SQLite 영구 저장

Render의 기본 파일 시스템은 재배포나 재시작 시 보존되지 않을 수 있으므로 SQLite를 사용할 때는 **Persistent Disk**가 필요합니다.

```text
Mount Path: /var/data
DB_PATH: /var/data/construction-classroom.db
```

`render.yaml`에는 1GB 디스크 예시가 포함되어 있습니다. 영구 디스크는 유료 서비스가 필요할 수 있습니다. 영구 디스크 없이 배포하면 평가 기록이 재배포 때 사라질 수 있습니다.

### 17-4. 자동 배포

Render와 GitHub 저장소를 연결하면 `main` 브랜치에 새 커밋을 push할 때 자동으로 다시 배포할 수 있습니다.

## 18. GitHub Pages + Render 분리 배포

학생 화면은 GitHub Pages, API는 Render로 분리할 수도 있습니다.

1. Render에 서버를 배포합니다.
2. `index.html`의 `API_BASE_URL`을 Render 주소로 변경합니다.
3. Render의 `ALLOWED_ORIGINS`에 GitHub Pages 주소를 등록합니다.
4. 변경 내용을 GitHub에 push합니다.
5. 브라우저 개발자 도구에 CORS 오류가 없는지 확인합니다.

전체 앱을 Render 한 곳에서 제공하는 방식이 설정은 더 단순합니다.

## 19. REST API

### 공개 API

```text
GET  /api/health
GET  /api/config?classCode=CLASS_CODE
GET  /api/leaderboard?classCode=CLASS_CODE
POST /api/results
GET  /api/results/me?classCode=CLASS_CODE&studentName=NAME
```

### 관리자 API

```text
POST   /api/admin/login
GET    /api/admin/results?classCode=CLASS_CODE
DELETE /api/admin/results/:id
DELETE /api/admin/classes/:classCode/results
GET    /api/admin/export.csv?classCode=CLASS_CODE
GET    /api/admin/export.xlsx?classCode=CLASS_CODE
PUT    /api/admin/classes/:classCode/settings
```

관리자 API는 다음 헤더를 사용합니다.

```text
Authorization: Bearer 서버가_발급한_토큰
```

## 20. 보안과 개인정보

- 주민등록번호, 전화번호, 주소, 이메일, 생년월일을 요구하지 않습니다.
- 학생 별명, 학급 코드, 점수, 풀이 시간, 제출 시각, 문항별 결과만 저장합니다.
- `.env`, SQLite DB, 백업 파일을 공개 저장소에 올리지 않습니다.
- HTTPS 사용을 권장합니다.
- `ALLOWED_ORIGINS`에는 실제 학생 사이트 주소만 등록합니다.
- 학교 개인정보 처리 방침에 맞춰 오래된 기록을 정기적으로 삭제합니다.

## 21. 점검 명령

서버 문법:

```powershell
npm run check
```

서버 상태:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

패키지 재설치 후 서버 실행:

```powershell
Remove-Item node_modules -Recurse -Force
npm install
npm start
```

## 22. 알려진 제한 사항

- 삼각형 작도는 다음 버전에 추가할 수 있도록 객체·수업 엔진을 분리했습니다.
- 부분 지우개는 자유선은 실제로 나누어 지우지만, 수학적 선분·직선·원·호는 객체 단위로 삭제합니다. 정확한 작도 객체를 중간에서 잘라 새로운 수학 객체로 만드는 기능은 포함하지 않았습니다.
- 컴퍼스 원 판정은 학생이 약 330° 이상 직접 회전했을 때 원으로 확정합니다.
- SQLite와 단일 서버 프로세스는 일반 학급 규모에 적합합니다. 학교 전체 규모나 여러 서버 인스턴스에는 PostgreSQL 같은 중앙 데이터베이스가 적합합니다.
- 이 앱은 수업 중 형성평가용이며 고위험 시험 감독 시스템이 아닙니다.
