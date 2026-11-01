# 개발 단계

| 단계 | 내용 | 상태 |
|---|---|---|
| 1 | 마우스로 단어 조회 (리더, lookup, state) | 구현됨 |
| 2 | 시선 문장 지정, 제스처 단어 조정, 메뉴 (`INTERACTION.md`) | 구현됨, 실제 웹캠 확인 중 |
| 3 | 어려운 단어 강조 | 화면 미구현 (`back/app/services/difficulty.py`만 있음) |
| 4 | 원형 복원과 난이도 지표 | 원형 복원 구현됨 (`morph.py`), 난이도 지표 미완 |

## 남은 연동
- 사전·번역 키와 로컬 LLM(`back/app/services/explain.py`), 서버 배포: 팀장 담당. 배포 조건은 `README.md`를 본다.
