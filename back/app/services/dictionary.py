# from ..config import settings


# def find_meaning(lemma: str, pos: str) -> str | None:
#     """원형으로 사전 조회. TODO: 사전 API 연동 (settings.dict_api_key)."""
#     _ = settings.dict_api_key
#     return None

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
                    first_item = items[0]
                    sense = first_item.get("sense", [{}])[0] if isinstance(first_item.get("sense"), list) else first_item.get("sense", {})
                    return {
                        "word": first_item.get("word"),
                        "origin_word": keyword,
                        "pos": sense.get("pos", ""),
                        "definition": sense.get("definition", "뜻풀이가 없습니다.")
                    }
                return {"word": keyword, "definition": "사전에서 검색 결과를 찾을 수 없습니다."}
            return {"error": f"API 호출 실패 (Status Code: {response.status_code})"}
        except Exception as e:
            return {"error": f"사전 조회 중 오류 발생: {str(e)}"}