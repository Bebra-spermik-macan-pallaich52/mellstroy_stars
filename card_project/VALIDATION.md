# Результаты проверки

Проверено на Python 3.12.14 в отдельном виртуальном окружении. Версии зависимостей закреплены в requirements.txt.

Команда:

```text
python -m pytest --cov=app/utils --cov-branch --cov-report=term-missing --cov-report=html:coverage_re --cov-fail-under=100 -q
```

Результат: **176 passed**. Класс Card: 39 исполняемых строк, 0 пропущенных; 14 ветвей, 0 пропущенных. Покрытие строк и ветвей **100%**. HTML-отчёт создан в coverage_re/index.html.

Количество записей JSON:

- `card_number_cases.json`: 20
- `cvv_cases.json`: 17
- `expiry_date_cases.json`: 26
- `full_card_cases.json`: 66
- `holder_name_cases.json`: 22
- `luhn_cases.json`: 17
- `pairwise_cases.json`: 6

Дополнительно выполнены две проверки тест-дизайна: единственность ошибки в полной карте и покрытие всех 24 парных сочетаний.
