import json
from pathlib import Path

import pytest


DATA = Path(__file__).parent / "data"


def read_cases(name):
    with (DATA / f"{name}.json").open(encoding="utf-8") as source:
        return json.load(source)


def pytest_generate_tests(metafunc):
    if "case" in metafunc.fixturenames:
        name = metafunc.definition.get_closest_marker("parametrize").args[1][0]
        cases = read_cases(name)
        metafunc.parametrize("case", range(len(cases)), indirect=True, ids=[case["id"] for case in cases])


@pytest.fixture
def case(request, dataset):
    return read_cases(dataset)[request.param]


@pytest.fixture
def all_cases():
    return {path.stem: read_cases(path.stem) for path in DATA.glob("*.json")}
