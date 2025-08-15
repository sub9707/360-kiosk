# 360도 촬영 및 편집 애플리케이션 

(주)하우두유두 이벤트 부스에서 사용된 360 촬영 일렉트론과 안드로이드 모바일 어플리케이션입니다.

기본 구조는 React 일렉트론과 안드로이드 모바일 앱이 웹소켓 통신하여 촬영 신호를 송수신하고,

모바일 앱이 촬영한 동영상을 전달하여 일렉트론 앱에서 편집, QR 코드 생성, 구글 드라이브와 로컬 드라이브 저장하는 구조입니다.

사용자는 촬영된 동영상을 생성된 QR 코드로 접근하여 시청 및 다운로드 할 수 있습니다.

<br/>

## 시연 및 사용 (2025.08.14 성암아트홀 설윤 하이볼 팬미팅)
<div align="center">
  <img src="https://github.com/user-attachments/assets/43c977b3-0bbd-4785-9a0d-62ca1dbeea2b" width="400"/>
  <img src="https://github.com/user-attachments/assets/2f43a4c4-5fca-4ddf-a484-fe1ab382dc06" width="400"/>
</div>

---

## 목차





## 📱 모바일 앱

<div align="center">
  
  ### Android 지원
  
  <table>
    <tr>
      <td align="center">
        <img src="https://via.placeholder.com/300x600/f59e0b/ffffff?text=Mobile+App+Screenshot" alt="모바일 앱 스크린샷" width="250"/>
        <br/>
        <strong>메인 화면 및 핵심 기능</strong>
      </td>
    </tr>
  </table>
  </p>
  
</div>

### 📱 모바일 앱 주요 기능

- **촬영 신호 송수신**: 일렉트론 앱에서 촬영 신호를 수신하여 15초간 동영상 촬영을 진행합니다.
- **동영상 저장 및 송신**: 촬영 기기 스토리지에 임시 파일로 저장하고, 송신이 완료되면 즉시 삭제합니다.  
- **제어기기 연결상태 출력**: 일렉트론 앱과의 연결 상태를 실시간으로 출력합니다.

---

## 💻 일렉트론 앱

<div align="center">
  
  ### Windows
  
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
  
</div>

### 페이지별 주요 기능

**Main 페이지**

1. 최근 촬영된 편집 영상을 배경 영상으로 출력합니다. 

2. 파일관리자를 통해 로컬 드라이브의 저장된 영상을 삭제하여 영상 노출을 원하지않는 참여자의 영상을 제거할 수 있습니다.
단, 구글드라이브에 저장되는 영상은 삭제되지 않음.
또한 파일관리자에서 영상과 함께 저장된 QR 코드를 확인할 수 있습니다.

**Film 페이지**

1. 모바일 앱과의 연결상태 확인 및 연결 시도

2. 촬영 시작 신호 송신

3. 촬영 중지, 재촬영 기능

4. 동영상 편집 시작

5. QR 코드 생성 및 로컬 & 구글 드라이브 저장

**Result 페이지**

1. 처리된 결과 영상 확인

2. QR 코드 출력


---

## ⚡ 빠른 시작

### 📋 필요 조건

- Node.js 18.0.0 이상
- npm 또는 yarn
- Android Studio (모바일 앱 개발용)
- 구글 드라이브 OAuth2.0 Credential Key 발급 필요

### 🛠️ 설치 및 실행

```bash
# 저장소 클론
git clone https://github.com/sub9707/360-kiosk
cd 360-kiosk

# 일렉트론 앱 실행
cd electron
# 의존성 설치
npm install

npm start
```

### 🏗️ 빌드

```bash
# 데스크톱 앱 빌드
cd electron
npm run make
```

---

## 🛠️ 기술 스택

### 모바일 앱

### 데스크톱 앱
- **Electron**: 크로스 플랫폼 데스크톱 앱
- **React**: UI 라이브러리
- **TypeScript**: 정적 타입 지원
- **vite**: 번들링
- **Electron Builder**: 앱 패키징

### 공통
- **ESLint**: 코드 품질 관리
- **Prettier**: 코드 포맷팅

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