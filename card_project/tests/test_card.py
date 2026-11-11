import pytest

from app.utils.card import Card


class TestCard:
    @pytest.mark.parametrize("dataset", ["card_number_cases"])
    def test_card_number(self, dataset, case):
        assert Card.is_valid_card_number(case["card_number"]) is case["valid"]

    @pytest.mark.parametrize("dataset", ["holder_name_cases"])
    def test_holder_name(self, dataset, case):
        assert Card.is_valid_card_holder_name(case["holder_name"]) is case["valid"]

    @pytest.mark.parametrize("dataset", ["expiry_date_cases"])
    def test_expiry_date(self, dataset, case):
        assert Card.is_valid_expiry_date(case["expiry_date"]) is case["valid"]

    @pytest.mark.parametrize("dataset", ["cvv_cases"])
    def test_cvv(self, dataset, case):
        assert Card.is_valid_cvv(case["cvv"]) is case["valid"]

    @pytest.mark.parametrize("dataset", ["luhn_cases"])
    def test_luhn(self, dataset, case):
        assert Card.luhn_check(case["card_number"]) is case["valid"]

    @pytest.mark.parametrize("dataset", ["full_card_cases"])
    def test_full_card(self, dataset, case):
        assert Card.is_valid_card(case["card_number"], case["holder_name"], case["expiry_date"], case["cvv"]) is case["valid"]

    @pytest.mark.parametrize("dataset", ["pairwise_cases"])
    def test_pairwise(self, dataset, case):
        assert Card.is_valid_card(case["card_number"], case["holder_name"], case["expiry_date"], case["cvv"]) is case["valid"]

