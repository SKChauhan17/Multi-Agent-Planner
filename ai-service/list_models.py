from agents.planner import FALLBACK_MODELS


def main() -> None:
    print("Configured model fallback chain:\n")
    for index, config in enumerate(FALLBACK_MODELS, start=1):
        provider = config.get("provider", "unknown")
        model = config.get("model", "unknown")
        print(f"{index}. {provider}: {model}")


if __name__ == "__main__":
    main()