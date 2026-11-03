import httpx
import json
from app.config import settings

DICT_API_URL = "https://opendict.korean.go.kr/api/search"

async def fetch_dictionary_meaning(keyword: str) -> dict:
    # config.py의 settings.dict_api_key 변수 사용
    api_key = settings.dict_api_key
    if not api_key:
        return {"error": "DICT_API_KEY가 .env 파일에 설정되지 않았습니다."}

    params = {
        "key": api_key,
        "q": keyword,
        "req_type": "json",
        "part": "word",
        "sort": "dict"
    }

    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(DICT_API_URL, params=params, timeout=5.0)
            if response.status_code == 200:
                data = response.json()
                items = data.get("channel", {}).get("item", [])
                
                if items:
                    meanings = []
                    is_first_origin = True  # 첫 번째 한자어 그룹 여부 체크

                    for item in items:
                        if len(meanings) >= 6:
                            break

                        raw_word = item.get("word", keyword)
                        clean_word = raw_word.replace("^", "").replace("-", "").strip()
                        
                        # 키워드가 정확히 일치하는 표제어만 처리
                        if clean_word == keyword:
                            senses = item.get("sense", [])
                            if isinstance(senses, dict):
                                senses = [senses]

                            # 첫 번째 한자어 그룹: 최대 3개까지 수집
                            if is_first_origin:
                                for sense in senses[:3]:
                                    if len(meanings) >= 6:
                                        break
                                    meanings.append({
                                        "word": clean_word,
                                        "origin": sense.get("origin", ""),
                                        "pos": sense.get("pos", ""),
                                        "definition": sense.get("definition", "뜻풀이가 없습니다.")
                                    })
                                if senses:
                                    is_first_origin = False  # 다음 한자어부터는 1개씩만 수집
                            
                            # 두 번째 이후 한자어 그룹: 가장 대표 뜻 1개만 수집
                            else:
                                if senses:
                                    sense = senses[0]
                                    meanings.append({
                                        "word": clean_word,
                                        "origin": sense.get("origin", ""),
                                        "pos": sense.get("pos", ""),
                                        "definition": sense.get("definition", "뜻풀이가 없습니다.")
                                    })

                    if meanings:
                        return {
                            "origin_word": keyword,
                            "meanings": meanings
                        }
                
                return {"word": keyword, "definition": "사전에서 검색 결과를 찾을 수 없습니다."}
            return {"error": f"API 호출 실패 (Status Code: {response.status_code})"}
        except Exception as e:
            return {"error": f"사전 조회 중 오류 발생: {str(e)}"}