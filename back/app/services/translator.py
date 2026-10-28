import httpx
from app.config import settings

DEEPL_API_URL = "https://api-free.deepl.com/v2/translate"

async def translate_to_korean(text: str) -> dict | None:
    """
    DeepL API Free를 사용하여 입력된 텍스트(영어, 외래어 등)를 한국어(KO)로 번역합니다.
    """
    api_key = settings.deepl_api_key
    if not api_key:
        print("[DeepL] DEEPL_API_KEY가 설정되지 않았습니다.")
        return None

    headers = {
        "Authorization": f"DeepL-Auth-Key {api_key}",
        "Content-Type": "application/json"
    }

    payload = {
        "text": [text],
        "target_lang": "KO"
    }

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(DEEPL_API_URL, json=payload, headers=headers, timeout=5.0)
            
            if response.status_code == 200:
                data = response.json()
                translations = data.get("translations", [])
                if translations:
                    translated_text = translations[0].get("text", "")
                    detected_lang = translations[0].get("detected_source_language", "")
                    
                    return {
                        "source": "DeepL",
                        "original_text": text,
                        "translated_text": translated_text,
                        "detected_language": detected_lang
                    }
            else:
                print(f"[DeepL API 오류] Status Code: {response.status_code}, Response: {response.text}")
        except Exception as e:
            print(f"[DeepL API 호출 예외] {e}")

    return None