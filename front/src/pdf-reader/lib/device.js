// 휴대폰인가. 좁게 줄인 PC 창은 시선·손을 그대로 써야 하므로 터치 기기만 본다.
const PHONE = '(pointer:coarse) and (max-width:767px), (pointer:coarse) and (max-height:500px)';

export const isPhone = (match = window.matchMedia) => match(PHONE).matches;
