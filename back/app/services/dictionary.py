import httpx
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
                    
                    for item in items:
                        raw_word = item.get("word", keyword)
                        clean_word = raw_word.replace("^", "").replace("-", "").strip()
                        
                        # 입력한 키워드와 완전히 일치하는 표제어만 추출
                        if clean_word == keyword:
                            sense = item.get("sense", [{}])[0] if isinstance(item.get("sense"), list) else item.get("sense", {})
                            
                            meanings.append({
                                "word": clean_word,
                                "pos": sense.get("pos", ""),
                                "definition": sense.get("definition", "뜻풀이가 없습니다.")
                            })
                            
                            # 일치하는 항목을 최대 6개까지 찾으면 반복 종료
                            if len(meanings) == 6:
                                break
                    
                    # 완전 일치하는 단어의 뜻풀이가 하나라도 존재하는 경우
                    if meanings:
                        return {
                            "origin_word": keyword,
                            "meanings": meanings
                        }
                
                return {"word": keyword, "definition": "사전에서 검색 결과를 찾을 수 없습니다."}
            return {"error": f"API 호출 실패 (Status Code: {response.status_code})"}
        except Exception as e:
            return {"error": f"사전 조회 중 오류 발생: {str(e)}"}