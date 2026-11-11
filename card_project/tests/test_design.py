from itertools import combinations, product

from app.utils.card import Card


FIELDS = ("card_number", "holder_name", "expiry_date", "cvv")
CHECKS = (Card.is_valid_card_number, Card.is_valid_card_holder_name, Card.is_valid_expiry_date, Card.is_valid_cvv)


def test_single_fault_cases(all_cases):
    for case in all_cases["full_card_cases"]:
        failures = sum(not check(case[field]) for field, check in zip(FIELDS, CHECKS))
        assert failures == (0 if case["valid"] else 1)


def test_all_pairs_covered(all_cases):
    rows = all_cases["pairwise_cases"]
    for first, second in combinations(FIELDS, 2):
        actual = {(row[first] is None, row[second] is None) for row in rows}
        assert actual == set(product((False, True), repeat=2))
