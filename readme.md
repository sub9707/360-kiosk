# 360 Kiosk Project

360도 키오스크 프로젝트입니다. 데스크톱과 모바일 애플리케이션을 포함하고 있습니다.


## 📱 모바일 앱

<div align="center">
  
  ### iOS & Android 지원
  
  <table>
    <tr>
      <td align="center">
        <img src="https://via.placeholder.com/300x600/f59e0b/ffffff?text=Mobile+App+Screenshot" alt="모바일 앱 스크린샷" width="250"/>
        <br/>
        <strong>메인 화면 및 핵심 기능</strong>
      </td>
    </tr>
  </table>
  
  <!-- 모바일 앱 다운로드 링크 -->
  <p>
    <a href="https://apps.apple.com/app/your-app">
      <img src="https://img.shields.io/badge/Download_on_the-App_Store-black?style=for-the-badge&logo=apple&logoColor=white" alt="App Store"/>
    </a>
    <a href="https://play.google.com/store/apps/details?id=your.app">
      <img src="https://img.shields.io/badge/Get_it_on-Google_Play-green?style=for-the-badge&logo=google-play&logoColor=white" alt="Google Play"/>
    </a>
  </p>
  
</div>

### 📱 모바일 앱 주요 기능

- ✨ **기능 1**: 기능에 대한 설명
- 🎨 **기능 2**: 기능에 대한 설명  
- 🔒 **기능 3**: 기능에 대한 설명
- 📊 **기능 4**: 기능에 대한 설명

---

## 💻 데스크톱 앱

<div align="center">
  
  ### Windows, macOS, Linux 지원
  
  <table>
    <tr>
      <td align="center">
        <img src="https://via.placeholder.com/350x250/8b5cf6/ffffff?text=Page+1" alt="페이지 1 스크린샷" width="300"/>
        <br/>
        <strong>메인 대시보드</strong>
      </td>
      <td align="center">
        <img src="https://via.placeholder.com/350x250/f59e0b/ffffff?text=Page+2" alt="페이지 2 스크린샷" width="300"/>
        <br/>
        <strong>데이터 관리 페이지</strong>
      </td>
      <td align="center">
        <img src="https://via.placeholder.com/350x250/10b981/ffffff?text=Page+3" alt="페이지 3 스크린샷" width="300"/>
        <br/>
        <strong>설정 페이지</strong>
      </td>
    </tr>
    <tr>
      <td align="center">
        <img src="https://via.placeholder.com/350x250/ef4444/ffffff?text=Page+4" alt="페이지 4 스크린샷" width="300"/>
        <br/>
        <strong>분석 및 리포트</strong>
      </td>
      <td align="center">
        <img src="https://via.placeholder.com/350x250/6366f1/ffffff?text=Page+5" alt="페이지 5 스크린샷" width="300"/>
        <br/>
        <strong>사용자 관리</strong>
      </td>
      <td align="center">
        <img src="https://via.placeholder.com/350x250/f97316/ffffff?text=Page+6" alt="페이지 6 스크린샷" width="300"/>
        <br/>
        <strong>도움말 및 지원</strong>
      </td>
    </tr>
  </table>
  
  <!-- 데스크톱 앱 다운로드 링크 -->
  <p>
    <a href="https://github.com/username/project/releases/latest">
      <img src="https://img.shields.io/badge/Download-Windows-blue?style=for-the-badge&logo=windows&logoColor=white" alt="Windows"/>
    </a>
    <a href="https://github.com/username/project/releases/latest">
      <img src="https://img.shields.io/badge/Download-macOS-lightgrey?style=for-the-badge&logo=apple&logoColor=white" alt="macOS"/>
    </a>
    <a href="https://github.com/username/project/releases/latest">
      <img src="https://img.shields.io/badge/Download-Linux-orange?style=for-the-badge&logo=linux&logoColor=white" alt="Linux"/>
    </a>
  </p>
  
</div>

### 💻 데스크톱 앱 주요 기능

- 🖥️ **크로스 플랫폼**: Windows, macOS, Linux 모두 지원
- ⚡ **고성능**: 네이티브 수준의 성능
- 🎯 **직관적 UI**: 사용하기 쉬운 인터페이스
- 🔄 **실시간 동기화**: 모바일 앱과 데이터 동기화

---

## ⚡ 빠른 시작

### 📋 필요 조건

- Node.js 18.0.0 이상
- npm 또는 yarn
- React Native CLI (모바일 앱 개발용)
- Android Studio / Xcode (모바일 앱 개발용)

### 🛠️ 설치 및 실행

```bash
# 저장소 클론
git clone https://github.com/username/project-name.git
cd project-name

# 의존성 설치
npm install

# 모바일 앱 실행 (iOS)
cd mobile
npx react-native run-ios

# 모바일 앱 실행 (Android)
npx react-native run-android

# 데스크톱 앱 실행
cd desktop
npm run dev
```

### 🏗️ 빌드

```bash
# 모바일 앱 빌드
cd mobile
npm run build:ios
npm run build:android

# 데스크톱 앱 빌드
cd desktop
npm run build
npm run dist
```

---

## 🏗️ 프로젝트 구조

```
360-kiosk/
├── electron/
│   ├── .vite/
│   ├── src/
│   │   ├── IPC/                  # IPC 관련 코드
│   │   ├── exe/                  # 실행 파일 관련 코드
│   │   ├── main.ts               # 메인 프로세스
│   │   ├── preload.ts            # 프리로드 스크립트
│   │   ├── renderer/
│   │   │   ├── api/              # API 관련 코드
│   │   │   ├── app.tsx           # 앱 루트 컴포넌트
│   │   │   ├── assets/           # 자산 파일들
│   │   │   ├── components/       # React 컴포넌트들
│   │   │   ├── hooks/            # 커스텀 훅들
│   │   │   ├── pages/            # 페이지 컴포넌트들
│   │   │   ├── styles/           # 스타일 파일들
│   │   │   └── types/            # 타입 정의
│   │   ├── root.tsx              # 루트 컴포넌트
│   │   ├── types/                # 타입 정의
│   │   └── utils/                # 유틸리티 함수들
│   ├── vite.main.config.ts
│   ├── vite.preload.config.ts
│   ├── vite.renderer.config.ts
│   ├── package.json
│   └── tsconfig.json
│
├── mobile_app/
│   ├── app/
│   │   ├── src/                  # Java/Kotlin 소스 코드
│   │   ├── res/                  # 리소스 파일들
│   │   └── AndroidManifest.xml   # 앱 매니페스트
│   ├── gradle/
│   │   └── wrapper/
│   ├── .gradle/
│   ├── .kotlin/
│   ├── key/
│   │   └── release-key.jks       # 릴리즈 서명 키
│   ├── build.gradle.kts
│   ├── gradle.properties
│   ├── local.properties
│   └── settings.gradle.kts
│
└── readme/
    ├── docs/                     # 문서 파일들
    └── images/                   # 문서 이미지들
```

---

## 🛠️ 기술 스택

### 모바일 앱
- **React Native**: 크로스 플랫폼 모바일 개발
- **TypeScript**: 정적 타입 지원
- **React Navigation**: 네비게이션
- **Async Storage**: 로컬 저장소
- **React Query**: 서버 상태 관리

### 데스크톱 앱
- **Electron**: 크로스 플랫폼 데스크톱 앱
- **React**: UI 라이브러리
- **TypeScript**: 정적 타입 지원
- **Webpack**: 번들링
- **Electron Builder**: 앱 패키징

### 공통
- **ESLint**: 코드 품질 관리
- **Prettier**: 코드 포맷팅
- **Jest**: 테스트 프레임워크

---

## 📖 문서

- [🚀 시작하기](docs/getting-started.md)
- [📱 모바일 앱 개발 가이드](docs/mobile-development.md)
- [💻 데스크톱 앱 개발 가이드](docs/desktop-development.md)
- [🔧 API 문서](docs/api-documentation.md)
- [🎨 UI/UX 가이드라인](docs/ui-guidelines.md)

---

## 🤝 기여하기

프로젝트에 기여해주셔서 감사합니다! 기여 방법:

1. 이 저장소를 Fork 하세요
2. 기능 브랜치를 생성하세요 (`git checkout -b feature/amazing-feature`)
3. 변경사항을 커밋하세요 (`git commit -m 'Add amazing feature'`)
4. 브랜치에 Push 하세요 (`git push origin feature/amazing-feature`)
5. Pull Request를 생성하세요

더 자세한 내용은 [CONTRIBUTING.md](CONTRIBUTING.md)를 참고하세요.

---

## 📝 라이선스

이 프로젝트는 MIT 라이선스 하에 있습니다. 자세한 내용은 [LICENSE](LICENSE) 파일을 참고하세요.

---

## 👥 팀

<div align="center">
  
  <table>
    <tr>
      <td align="center">
        <img src="https://github.com/username1.png" width="100px;" alt=""/>
        <br/>
        <sub><b>이름1</b></sub>
        <br/>
        <sub>Project Lead</sub>
      </td>
      <td align="center">
        <img src="https://github.com/username2.png" width="100px;" alt=""/>
        <br/>
        <sub><b>이름2</b></sub>
        <br/>
        <sub>Mobile Developer</sub>
      </td>
      <td align="center">
        <img src="https://github.com/username3.png" width="100px;" alt=""/>
        <br/>
        <sub><b>이름3</b></sub>
        <br/>
        <sub>Desktop Developer</sub>
      </td>
    </tr>
  </table>
  
</div>

---

## 💬 소통

- 📧 이메일: contact@yourproject.com
- 💬 디스코드: [서버 링크](https://discord.gg/yourserver)
- 🐦 트위터: [@yourproject](https://twitter.com/yourproject)
- 🌐 웹사이트: [yourproject.com](https://yourproject.com)

---

## 📊 통계

<div align="center">
  
  <img src="https://github-readme-stats.vercel.app/api?username=yourusername&show_icons=true&theme=radical" alt="GitHub Stats"/>
  
  <img src="https://github-readme-stats.vercel.app/api/top-langs/?username=yourusername&layout=compact&theme=radical" alt="Top Languages"/>
  
</div>

---

<div align="center">
  
  **⭐ 이 프로젝트가 유용했다면 별표를 눌러주세요!**
  
  Made with ❤️ by [Your Team Name]
  
</div>