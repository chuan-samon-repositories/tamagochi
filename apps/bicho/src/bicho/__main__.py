from .server import serve


def main():
    try:
        serve()
    except KeyboardInterrupt:
        print("\nEl bicho se duerme.")


if __name__ == "__main__":
    main()
