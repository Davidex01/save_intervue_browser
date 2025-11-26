# backend.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
from typing import Dict, Any


# Простое in-memory хранилище интервью. Потом можно заменить на БД.
INTERVIEWS: Dict[str, Dict[str, Any]] = {}

# если файл у тебя называется generation.py — меняешь тут имя
from generation import generate_interview_tasks

app = FastAPI()

# --- CORS, чтобы фронт мог дергать бэк из браузера ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # можешь сузить до нужного домена
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Схема запроса ---
class VacancyRequest(BaseModel):
    vacancy: str
    token: str | None = None
    position: str | None = None
    complexity: str | None = None


# --- Эндпоинт /api/generate-tasks ---
@app.post("/api/generate-tasks")
def generate_tasks(req: VacancyRequest):
    try:
        # вызывем твой генератор задач (можно передавать vacancy как есть)
        tasks = generate_interview_tasks(req.vacancy)

        # выбираем токен: из запроса, либо генерим на бэке (если не пришёл)
        token = req.token or "int_" + str(len(INTERVIEWS) + 1)

        # сохраняем интервью в памяти
        raw = generate_interview_tasks(req.vacancy)
        tasks = raw.get("tasks", raw)  # если raw уже список, это тоже сработает

        INTERVIEWS[token] = {
            "token": token,
            "position": req.position,
            "complexity": req.complexity,
            "tasks": tasks,
        }

        # опционально можешь здесь сериализовать tasks, преобразовать форматы и т.п.

        return INTERVIEWS[token]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@app.get("/api/interview/{token}")
def get_interview(token: str):
    interview = INTERVIEWS.get(token)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    return interview