import base64
import json
import sys
import tempfile

from faster_whisper import WhisperModel


def main():
    model_name = "base.en"
    if len(sys.argv) == 3 and sys.argv[1] == "--model":
        model_name = sys.argv[2]
    model = WhisperModel(model_name, device="auto", compute_type="int8")
    for line in sys.stdin:
        request = json.loads(line)
        response = {"id": request.get("id")}
        try:
            audio = base64.b64decode(request["audio"])
            with tempfile.NamedTemporaryFile(suffix=".wav") as source:
                source.write(audio)
                source.flush()
                segments, _ = model.transcribe(source.name, vad_filter=True)
                response["text"] = " ".join(segment.text.strip() for segment in segments).strip()
        except Exception as error:
            response["error"] = str(error)
        print(json.dumps(response), flush=True)


if __name__ == "__main__":
    main()
