from getpass import getpass

from app.utils.card import Card


def main():
    number = input("Номер карты: ")
    name = input("Имя владельца (латиницей): ")
    expiry = input("Срок действия (MM/yy или MM/yyyy): ")
    cvv = getpass("CVV: ")
    valid = Card.is_valid_card(number, name, expiry, cvv)
    print("Данные карты корректны" if valid else "В данных карты есть ошибка")


if __name__ == "__main__":
    main()
