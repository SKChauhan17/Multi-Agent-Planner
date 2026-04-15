from dotenv import load_dotenv
from google import genai

def main():
    # Load the variables from the .env file
    load_dotenv()
    
    # Now the client will automatically find GEMINI_API_KEY
    client = genai.Client()
    
    print("Fetching available models...\n")
    
    # Loop through the available models and print their names
    for model in client.models.list():
        print(model.name)

if __name__ == "__main__":
    main()