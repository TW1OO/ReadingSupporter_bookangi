/**
 * 오토 프레이밍: 카메라 원본 프레임 중 정사각형 한 창만 잘라서 쓰고, 그 창이 얼굴을 따라간다.
 * 사용자가 움직여도 얼굴이 모델 입력 안에서 거의 같은 자리·같은 크기로 유지된다.
 * 전부 순수 함수라 웹캠 없이 테스트한다. 좌표 단위는 원본 프레임 픽셀.
 */
export interface CropRect {
  sx: number;
  sy: number;
  side: number;
}

export interface CropOptions {
  /** 한 변 = 원본 짧은 변 × frac. 예: 640×640 중 480 → 0.75 */
  frac: number;
  /** 얼굴 중심이 창 중심에서 창 한 변 × deadZone 이내면 움직이지 않는다 (미세 떨림에 창이 흔들리는 것 방지) */
  deadZone: number;
  /** 프레임마다 목표로 다가가는 비율 (0~1). 작을수록 부드럽고 느리다. */
  follow: number;
  /** 얼굴이 사라졌을 때 원본 중앙으로 천천히 돌아오는 비율 */
  recenter: number;
}

export const DEFAULT_CROP: CropOptions = { frac: 0.75, deadZone: 0.06, follow: 0.18, recenter: 0.03 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function centerCrop(srcW: number, srcH: number, frac = DEFAULT_CROP.frac): CropRect {
  const side = Math.round(Math.min(srcW, srcH) * frac);
  return { sx: Math.round((srcW - side) / 2), sy: Math.round((srcH - side) / 2), side };
}

/**
 * 다음 프레임의 창 위치.
 * @param face 얼굴 중심(원본 픽셀). 얼굴이 없으면 null → 원본 중앙으로 천천히 복귀
 */
export function followFace(
  prev: CropRect,
  face: { x: number; y: number } | null,
  srcW: number,
  srcH: number,
  opts: CropOptions = DEFAULT_CROP,
): CropRect {
  const { side } = prev;
  const maxX = srcW - side;
  const maxY = srcH - side;

  let tx: number;
  let ty: number;
  let rate: number;
  if (!face) {
    tx = maxX / 2;
    ty = maxY / 2;
    rate = opts.recenter;
  } else {
    const dx = face.x - (prev.sx + side / 2);
    const dy = face.y - (prev.sy + side / 2);
    // 데드존 안이면 그 축은 가만히 둔다
    tx = Math.abs(dx) <= opts.deadZone * side ? prev.sx : face.x - side / 2;
    ty = Math.abs(dy) <= opts.deadZone * side ? prev.sy : face.y - side / 2;
    rate = opts.follow;
  }
  return {
    side,
    sx: clamp(prev.sx + (clamp(tx, 0, maxX) - prev.sx) * rate, 0, maxX),
    sy: clamp(prev.sy + (clamp(ty, 0, maxY) - prev.sy) * rate, 0, maxY),
  };
}

/** 창 안의 정규화 좌표(0~1) -> 원본 프레임 정규화 좌표(0~1). */
export function cropToFull(
  p: { x: number; y: number },
  crop: CropRect,
  srcW: number,
  srcH: number,
): { x: number; y: number } {
  return { x: (crop.sx + p.x * crop.side) / srcW, y: (crop.sy + p.y * crop.side) / srcH };
}
