import re


class Card:
    @staticmethod
    def is_valid_card_number(card_number) -> bool:
        if not isinstance(card_number, str):
            return False
        number = card_number.replace(" ", "")
        return re.fullmatch(r"[0-9]{16}", number) is not None and Card.luhn_check(number)

    @staticmethod
    def is_valid_card_holder_name(holder_name) -> bool:
        if not isinstance(holder_name, str):
            return False
        words = holder_name.split()
        return len(words) == 2 and all(re.fullmatch(r"[A-Za-z]{2,}", word) is not None for word in words)

    @staticmethod
    def is_valid_expiry_date(expiry_date) -> bool:
        return isinstance(expiry_date, str) and re.fullmatch(r"(0[1-9]|1[0-2])/(?:[0-9]{2}|[0-9]{4})", expiry_date) is not None

    @staticmethod
    def is_valid_cvv(cvv) -> bool:
        return isinstance(cvv, str) and re.fullmatch(r"[0-9]{3}", cvv) is not None

    @staticmethod
    def is_valid_card(card_number, holder_name, expiry_date, cvv) -> bool:
        return (
            Card.is_valid_card_number(card_number)
            and Card.is_valid_card_holder_name(holder_name)
            and Card.is_valid_expiry_date(expiry_date)
            and Card.is_valid_cvv(cvv)
        )

    @staticmethod
    def luhn_check(card_number) -> bool:
        if not isinstance(card_number, str):
            return False
        number = card_number.replace(" ", "")
        if re.fullmatch(r"[0-9]+", number) is None:
            return False
        total = 0
        for index, digit in enumerate(reversed(number)):
            value = int(digit)
            if index % 2 == 1:
                value *= 2
                if value > 9:
                    value -= 9
            total += value
        return total % 10 == 0
