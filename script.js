// 1. 기본 설정 (비디오, 캔버스 2개, MediaPipe)
const video = document.getElementById("video");
const videoCanvas = document.getElementById("videoCanvas"); // 비디오 캔버스
const drawCanvas = document.getElementById("drawCanvas");   // 선을 그릴 캔버스
const videoCtx = videoCanvas.getContext("2d");
const drawCtx = drawCanvas.getContext("2d");
const clearBtn = document.getElementById("clearBtn");

// 캔버스 크기 설정
videoCanvas.width = drawCanvas.width = 1920;
videoCanvas.height = drawCanvas.height = 1080;

// 저장된 선들 (각 선은 {x1, y1, x2, y2, timestamp, opacity} 형식)
let lines = [];
const FADE_DURATION = 6000; // 6초 후 서서히 사라짐 (ms)
const SMOOTHING_FACTOR = 7; // 좌표 평균을 계산할 개수
let points = []; // 좌표 저장용 배열
let isDrawing = false;

// 2. 웹캠 활성화 (고해상도 요청 포함)
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    });
    video.srcObject = stream;
    video.style.display = "none"; // 비디오는 숨김
    await new Promise((resolve) => (video.onloadedmetadata = resolve));
    detectHands();
  } catch (error) {
    console.error("❌ 카메라를 사용할 수 없습니다:", error);
  }
}

// 3. MediaPipe Hands 설정
const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
});
hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
});
hands.onResults(drawHand);

// 손 인식 시작 함수
async function detectHands() {
  if (!video.videoWidth || !video.videoHeight) {
    console.error("❌ 비디오 크기가 0입니다!");
    return;
  }
  async function track() {
    await hands.send({ image: video });
    requestAnimationFrame(track);
  }
  track();
}

// 4. 손을 인식하여 선 정보를 저장하는 함수
function drawHand(results) {
  // 비디오 캔버스에 비디오 그리기 (미러링 적용)
  videoCtx.clearRect(0, 0, videoCanvas.width, videoCanvas.height);
  videoCtx.save();
  videoCtx.translate(videoCanvas.width, 0);
  videoCtx.scale(-1, 1);
  videoCtx.drawImage(video, 0, 0, videoCanvas.width, videoCanvas.height);
  videoCtx.restore();

  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) return;

  results.multiHandLandmarks.forEach((landmarks) => {
    const indexFinger = landmarks[8]; // 검지 끝 좌표
    const thumb = landmarks[4]; // 엄지 좌표

    if (!indexFinger || !thumb) return;

    // 캔버스 좌표 변환 (미러링 적용)
    const x = drawCanvas.width - (indexFinger.x * drawCanvas.width);
    const y = indexFinger.y * drawCanvas.height;

    console.log("검지 좌표:", x, y);

    // 엄지와 검지 사이 거리 계산 (주먹 쥠 여부 판단)
    const distance = Math.hypot(indexFinger.x - thumb.x, indexFinger.y - thumb.y);
    isDrawing = distance < 0.04;
    console.log("isDrawing 상태:", isDrawing);

    if (isDrawing) {
      points.push({ x, y });
      if (points.length > SMOOTHING_FACTOR) {
        points.shift();
      }

      if (points.length > 4) {
        let prev = points[points.length - 4];
        let curr = { x, y };

        // 좌표 간격이 너무 크면 중간 좌표 생성 (보간)
        let dist = Math.hypot(curr.x - prev.x, curr.y - prev.y);
        if (dist > 50) {
          let midX = (prev.x + curr.x) / 2;
          let midY = (prev.y + curr.y) / 2;
          points.splice(points.length - 2, 0, { x: midX, y: midY });
        }

        // 선 정보를 배열에 저장 (그리지는 않고 저장)
        lines.push({ x1: prev.x, y1: prev.y, x2: curr.x, y2: curr.y, timestamp: Date.now(), opacity: 1 });
      }
    } else {
      points = [];
    }
  });
}

// 5. 6초 후 서서히 선이 지워지는 효과 (애니메이션)
function fadeOldLines() {
  const now = Date.now();
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);

  lines = lines.filter(line => {
    const elapsed = now - line.timestamp;
    if (elapsed > FADE_DURATION) {
      return false;
    }

    let fadeFactor = 1 - (elapsed / FADE_DURATION);
    drawCtx.globalAlpha = Math.max(0, fadeFactor);
    drawCtx.strokeStyle = "black";
    drawCtx.lineWidth = 6;
    drawCtx.lineCap = "round";
    drawCtx.lineJoin = "round";

    drawCtx.beginPath();
    drawCtx.moveTo(line.x1, line.y1);
    drawCtx.quadraticCurveTo((line.x1 + line.x2) / 2, (line.y1 + line.y2) / 2, line.x2, line.y2);
    drawCtx.stroke();

    return true;
  });

  requestAnimationFrame(fadeOldLines);
}

// 6. 캔버스 지우기 기능 (즉시 전체 삭제)
clearBtn.addEventListener("click", () => {
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  lines = [];
});

// 실행
startCamera();
fadeOldLines(); // 서서히 지워지는 애니메이션 시작