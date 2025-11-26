# generator.py
import json
import subprocess
import tempfile
import textwrap
import re
from typing import List, Dict

from openai import OpenAI

# --------------------------------
# НАСТРОЙКИ LLM
# --------------------------------

from tokenn import API_KEY

BASE_URL = "https://llm.t1v.scibox.tech/v1"

CHAT_MODEL = "qwen3-32b-awq"
CODE_MODEL = "qwen3-coder-30b-a3b-instruct-fp8"

client = OpenAI(
    base_url=BASE_URL,
    api_key=API_KEY,
)


# --------------------------------
# ГЕНЕРАЦИЯ ЗАДАЧИ ИЗ ВАКАНСИИ
# --------------------------------

def generate_task_from_vacancy(vacancy_text: str, level_for_prompt: str) -> Dict:
    """
    Генерируем задачу под вакансию.
    level_for_prompt: что говорим модели ("easy" / "medium" / "hard"),
    но потом можем выставить любое название уровня снаружи.
    Возвращаем dict с полями: level (пока = level_for_prompt), statement, samples, tests.
    """
    prompt = f"""
Ты выступаешь как инженер по найму разработчиков.

Тебе даётся текст вакансии:

---
{vacancy_text}
---

Сгенерируй одну ЗАВЕРШЁННУЮ техническую задачу на Python уровня {level_for_prompt} для собеседования.

ОГРАНИЧЕНИЯ ПО ФОРМАТУ (СОБЛЮДАЙ ЖЁСТКО):

1. Входные данные: ровно ОДНО целое число (int) в одной строке.
2. Выходные данные: ровно ОДНО целое число (int) в одной строке.
3. Решение — функция solve(), которая читает одно целое число из stdin и печатает одно целое число в stdout.

Нужны:
- текстовое описание задачи (statement),
- 1–3 примера (samples),
- 5–10 тестов (tests).

Формат ответа строго в JSON, БЕЗ пояснений и текста вокруг, строго:

{{
  "statement": "<текст задачи>",
  "samples": [
    {{"input": "<одно целое число во входе>", "output": "<одно целое число в выводе>"}}
  ],
  "tests": [
    {{"input": "<одно целое число во входе>", "output": "<одно целое число в выводе>"}}
  ]
}}

Требования к input/output:
- input: только одно целое число и перевод строки (например "10\\n").
- output: только одно целое число и перевод строки (например "100\\n").
- НЕ ИСПОЛЬЗУЙ вещественные числа и точки (".") в примерах и тестах.
"""

    resp = client.chat.completions.create(
        model=CHAT_MODEL,
        messages=[
            {
                "role": "system",
                "content": "/no_think Ты генерируешь чёткие и проверяемые задачи для собеседований.",
            },
            {"role": "user", "content": textwrap.dedent(prompt).strip()},
        ],
        temperature=0.4,
    )

    content = resp.choices[0].message.content.strip()

    # Парсим JSON из ответа
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        start = content.find("{")
        end = content.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise ValueError(f"Не удалось распарсить JSON задачи из ответа: {content!r}")
        snippet = content[start : end + 1]
        data = json.loads(snippet)

    statement = data["statement"]
    samples = data.get("samples") or []
    tests = data.get("tests") or []

    # Фильтруем тесты: оставляем только те, где во входе/выходе ровно одно целое число
    def normalize_int_io(s: str) -> str:
        s = s.strip()
        # не допускаем точек
        if "." in s:
            raise ValueError("Обнаружено вещественное число, а нужны только целые")
        # должна быть одна целочисленная запись
        if not re.fullmatch(r"-?\d+", s):
            raise ValueError(f"Строка не похожа на одно целое число: {s!r}")
        return s + "\n"

    clean_tests = []
    for t in tests:
        try:
            inp_raw = t.get("input", "")
            out_raw = t.get("output", "")
            if not inp_raw or not out_raw:
                continue
            inp = normalize_int_io(inp_raw)
            out = normalize_int_io(out_raw)
            clean_tests.append({"input": inp, "output": out})
        except ValueError:
            # пропускаем тесты с дробями/мусором
            continue

    if not clean_tests:
        raise ValueError("Модель вернула задачу без пригодных целочисленных тестов")

    task = {
        "level": level_for_prompt,  # потом можем переписать снаружи
        "statement": statement,
        "samples": samples,
        "tests": clean_tests,
    }
    return task


# --------------------------------
# РЕШЕНИЕ ЗАДАЧИ ЧЕРЕЗ CODE-МОДЕЛЬ
# --------------------------------

def solve_task_with_llm(task: Dict) -> str:
    """
    Просим qwen-coder написать решение на Python.
    Ожидаем, что он вернёт код с функцией solve(),
    которая читает одно целое число из stdin и печатает одно целое число в stdout.
    """
    statement = task["statement"]
    samples = task["samples"]

    samples_text = ""
    if samples:
        samples_text = "\nПримеры:\n" + "\n".join(
            f"Ввод:\n{ s['input'] }\nВывод:\n{ s['output'] }\n" for s in samples
        )

    prompt = f"""
Тебе дана задача на собеседовании по программированию на Python.

Условие задачи:

---
{statement}
---

{samples_text}

Напиши корректное, рабочее решение на Python.

Требования:
- Оформи решение как функцию solve().
- Функция solve() должна читать ОДНО целое число из стандартного ввода (stdin)
  и печатать ОДНО целое число в стандартный вывод (stdout).
- Не печатай ничего лишнего (без дебаг-печати, без текстовых подсказок).
- НЕ возвращай результат из solve(), просто печатай его через print.
- Не включай примеры ввода/вывода в код.

Верни ТОЛЬКО код, без пояснений, без ``` и без лишнего текста вокруг.
"""

    resp = client.chat.completions.create(
        model=CODE_MODEL,
        messages=[
            {
                "role": "system",
                "content": "/no_think Ты опытный Python-разработчик и пишешь чистый рабочий код.",
            },
            {"role": "user", "content": textwrap.dedent(prompt).strip()},
        ],
        temperature=0.2,
    )

    code = resp.choices[0].message.content.strip()

    # На всякий случай, если модель вернула код в ```python ... ```
    if code.startswith("```"):
        code = code.strip("`")
        if code.lower().startswith("python"):
            code = code[len("python") :].lstrip()

    return code


# --------------------------------
# ЛОКАЛЬНАЯ ПРОВЕРКА РЕШЕНИЯ (ТОЛЬКО ЦЕЛЫЕ)
# --------------------------------

def _parse_int(s: str):
    m = re.search(r"-?\d+", s)
    if not m:
        return None
    return int(m.group(0))

def run_code_on_tests(code: str, tests: List[Dict], timeout: float = 3.0) -> bool:
    """
    Запускаем данный код на всех тестах.
    Ожидаем, что в коде есть функция solve(), которая читает stdin и пишет в stdout.
    Считаем, что формат: одно целое число -> одно целое число.
    """
    # Обёртка: если solve() что-то возвращает, напечатаем это
    full_code = code + """
if __name__ == "__main__":
    _res = solve()
    if _res is not None:
        print(_res)
"""

    with tempfile.TemporaryDirectory() as tmpdir:
        path = tempfile.NamedTemporaryFile(dir=tmpdir, suffix=".py", delete=False).name
        with open(path, "w", encoding="utf-8") as f:
            f.write(full_code)

        for i, test in enumerate(tests, start=1):
            inp = test["input"]
            expected = test["output"]

            try:
                proc = subprocess.run(
                    ["python", path],
                    input=inp.encode("utf-8"),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    timeout=timeout,
                )
            except subprocess.TimeoutExpired:
                print(f"Тест {i}: превышено время выполнения")
                return False

            out = proc.stdout.decode("utf-8")
            err = proc.stderr.decode("utf-8")

            expected_num = _parse_int(expected)
            got_num = _parse_int(out)

            if expected_num is None or got_num is None:
                print(f"Тест {i}: не удалось разобрать целое число")
                print("  Ввод:      ", repr(inp))
                print("  Ожидали:   ", repr(expected))
                print("  Получили:  ", repr(out))
                if err:
                    print("  stderr:", err)
                return False

            if expected_num != got_num:
                print(f"Тест {i}: ОШИБКА")
                print("  Ввод:        ", repr(inp))
                print("  Ожидали (int)", expected_num)
                print("  Получили (int)", got_num)
                print("  Сырой вывод: ", repr(out))
                if err:
                    print("  stderr:", err)
                return False

        return True


# --------------------------------
# ГЕНЕРАЦИЯ ПРОВЕРЕННОЙ ЗАДАЧИ
# --------------------------------

def generate_verified_task(vacancy_text: str, level_for_prompt: str, max_attempts: int = 20) -> Dict:
    """
    Пытаемся сгенерировать задачу нужного уровня (для промпта)
    и проверить её через qwen-coder + локальные тесты.
    Если получается — возвращаем task (без хранения решения).
    Если нет — кидаем ошибку.
    """
    for attempt in range(1, max_attempts + 1):
        print(f"[{level_for_prompt}] Попытка генерации задачи #{attempt}...")
        try:
            task = generate_task_from_vacancy(vacancy_text, level_for_prompt)
        except Exception as e:
            print(f"[{level_for_prompt}] Ошибка при генерации задачи: {e}")
            continue

        print(f"[{level_for_prompt}] Пытаемся решить с помощью code-модели...")
        code = solve_task_with_llm(task)

        ok = run_code_on_tests(code, task["tests"])
        if ok:
            print(f"[{level_for_prompt}] Успешно: задача прошла все тесты.")
            return task
        else:
            print(f"[{level_for_prompt}] Решение не прошло тесты, пробуем сгенерировать другую задачу...")

    raise RuntimeError(
        f"Не удалось получить рабочую задачу уровня {level_for_prompt} за {max_attempts} попыток"
    )


# --------------------------------
# ГЕНЕРАЦИЯ 3 ЗАДАЧ ПОД ВАКАНСИЮ
# --------------------------------

def generate_interview_tasks(vacancy_text: str) -> Dict:
    """
    Генерируем 3 задачи под одну вакансию.
    Фактически ВСЕ три генерим как easy (для устойчивости),
    но в выходном JSON уровни называем: easy, medium, hard.
    Возвращаем JSON-совместимый dict:
    {
      "vacancy": "...",
      "tasks": [
        {level, statement, samples, tests},
        ...
      ]
    }
    """
    label_levels = ["easy", "medium", "hard"]
    tasks = []

    for label in label_levels:
        # Для генерации всегда просим easy
        task = generate_verified_task(vacancy_text, level_for_prompt="easy", max_attempts=20)
        # А наружу маркируем как easy/medium/hard в зависимости от позиции
        task["level"] = label
        tasks.append(task)

    result = {
        "vacancy": vacancy_text,
        "tasks": tasks,
    }
    return result


# --------------------------------
# ДЕМО-ЗАПУСК
# --------------------------------

if __name__ == "__main__":
    import sys
    import os

    vacancy_path = os.path.join(os.path.dirname(__file__), "vacancy.txt")

    try:
        with open(vacancy_path, "r", encoding="utf-8") as f:
            vacancy_text = f.read().strip()
    except FileNotFoundError:
        print(f"Файл vacancy.txt не найден по пути: {vacancy_path}")
        sys.exit(1)

    if not vacancy_text:
        print("Файл vacancy.txt пустой – добавь туда текст вакансии.")
        sys.exit(1)

    data = generate_interview_tasks(vacancy_text)

    # 1) печатаем в консоль
    print(json.dumps(data, ensure_ascii=False, indent=2))

    # 2) сохраняем в файл рядом с проектом
    out_path = os.path.join(os.path.dirname(__file__), "generated_tasks.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\nJSON сохранён в файл {out_path}")

