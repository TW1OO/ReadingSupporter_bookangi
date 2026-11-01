from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    dict_api_key: str = ""
    deepl_api_key: str = ""
    cors_origins: list[str] = ["http://localhost:5173"]

    # 로컬 LLM (EXAONE). 기본은 꺼짐: GPU 없는 팀원 PC에서도 서버가 그대로 뜨게 한다.
    llm_enabled: bool = False
    llm_preload: bool = True  # 서버 시작 때 백그라운드로 모델을 올린다
    llm_model_path: str = ""
    llm_model_name: str = "EXAONE-3.5-7.8B-Instruct"
    llm_n_ctx: int = 32768
    llm_n_gpu_layers: int = -1  # -1 = 전부 GPU
    llm_n_batch: int = 512
    llm_n_threads: int | None = None
    llm_flash_attn: bool = True
    llm_chat_format: str = ""  # 비우면 GGUF에 들어 있는 채팅 템플릿을 쓴다


settings = Settings()
