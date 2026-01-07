#!/usr/bin/env python3
"""
Bedrock Anthropic Proxy

A transparent proxy that accepts standard Anthropic API requests and forwards them
to AWS Bedrock. This allows any Anthropic-compatible client (chat UIs, SDKs, etc.)
to use Claude models on Bedrock.

Usage:
    # Set your AWS credentials and region
    export AWS_REGION=us-east-1
    export AWS_ACCESS_KEY_ID=xxx  # or use AWS SSO/profiles
    export AWS_SECRET_ACCESS_KEY=xxx

    # Optionally set the default model
    export BEDROCK_MODEL=us.anthropic.claude-opus-4-20250514-v1:0

    # Run the proxy
    python bedrock_proxy.py

    # Point your Anthropic client at it
    export ANTHROPIC_BASE_URL=http://localhost:8080
    export ANTHROPIC_API_KEY=dummy  # Not used, but some clients require it
"""

import os
import json
import logging
from typing import AsyncGenerator
from datetime import datetime

import boto3
from botocore.config import Config
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse

# Configure logging
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Configuration
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
PROXY_PORT = int(os.getenv("PROXY_PORT", "8080"))

# Model mapping: Anthropic model names -> Bedrock inference profile IDs
# Using inference profiles for cross-region routing
MODEL_MAPPING = {
    # Opus 4
    "claude-opus-4-20250514": "us.anthropic.claude-opus-4-20250514-v1:0",
    "claude-4-opus": "us.anthropic.claude-opus-4-20250514-v1:0",
    "opus": "us.anthropic.claude-opus-4-20250514-v1:0",

    # Sonnet 4.5 (latest)
    "claude-sonnet-4-5-20250929": "global.anthropic.claude-sonnet-4-5-20250929-v1:0",
    "claude-4-5-sonnet": "global.anthropic.claude-sonnet-4-5-20250929-v1:0",
    "sonnet": "global.anthropic.claude-sonnet-4-5-20250929-v1:0",

    # Sonnet 4
    "claude-sonnet-4-20250514": "us.anthropic.claude-sonnet-4-20250514-v1:0",
    "claude-4-sonnet": "us.anthropic.claude-sonnet-4-20250514-v1:0",

    # Haiku 4.5
    "claude-haiku-4-5-20251001": "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    "claude-4-5-haiku": "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    "haiku": "us.anthropic.claude-haiku-4-5-20251001-v1:0",

    # Legacy models
    "claude-3-5-sonnet-20241022": "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
    "claude-3-5-haiku-20241022": "us.anthropic.claude-3-5-haiku-20241022-v1:0",
    "claude-3-opus-20240229": "us.anthropic.claude-3-opus-20240229-v1:0",
}

# Default model if none specified or not found in mapping
DEFAULT_MODEL = os.getenv("BEDROCK_MODEL", "us.anthropic.claude-opus-4-20250514-v1:0")

# Initialize Bedrock client
bedrock_config = Config(
    region_name=AWS_REGION,
    retries={"max_attempts": 3, "mode": "adaptive"}
)
bedrock_client = boto3.client("bedrock-runtime", config=bedrock_config)

app = FastAPI(
    title="Bedrock Anthropic Proxy",
    description="Transparent proxy for using Anthropic API clients with AWS Bedrock",
    version="1.0.0"
)


def map_model(model: str) -> str:
    """Map Anthropic model name to Bedrock inference profile ID."""
    # If it's already a Bedrock model ID, use it directly
    if "anthropic" in model.lower() and ("us." in model or "global." in model):
        return model

    # Check mapping
    if model in MODEL_MAPPING:
        return MODEL_MAPPING[model]

    # Try partial match
    model_lower = model.lower()
    for key, value in MODEL_MAPPING.items():
        if key in model_lower or model_lower in key:
            return value

    logger.warning(f"Unknown model '{model}', using default: {DEFAULT_MODEL}")
    return DEFAULT_MODEL


def convert_to_bedrock_format(request_data: dict) -> dict:
    """Convert Anthropic API request to Bedrock Converse API format."""
    messages = request_data.get("messages", [])
    system = request_data.get("system", "")

    # Convert messages to Bedrock format
    bedrock_messages = []
    for msg in messages:
        role = msg.get("role", "user")
        # Map "human" to "user" if needed
        if role == "human":
            role = "user"

        content = msg.get("content", "")

        # Handle different content formats
        if isinstance(content, str):
            bedrock_content = [{"text": content}]
        elif isinstance(content, list):
            bedrock_content = []
            for block in content:
                if isinstance(block, str):
                    bedrock_content.append({"text": block})
                elif isinstance(block, dict):
                    block_type = block.get("type", "text")
                    if block_type == "text":
                        bedrock_content.append({"text": block.get("text", "")})
                    elif block_type == "image":
                        # Handle image content
                        source = block.get("source", {})
                        bedrock_content.append({
                            "image": {
                                "format": source.get("media_type", "image/jpeg").split("/")[-1],
                                "source": {"bytes": source.get("data", "")}
                            }
                        })
                    elif block_type == "tool_use":
                        bedrock_content.append({
                            "toolUse": {
                                "toolUseId": block.get("id", ""),
                                "name": block.get("name", ""),
                                "input": block.get("input", {})
                            }
                        })
                    elif block_type == "tool_result":
                        bedrock_content.append({
                            "toolResult": {
                                "toolUseId": block.get("tool_use_id", ""),
                                "content": [{"text": str(block.get("content", ""))}]
                            }
                        })
        else:
            bedrock_content = [{"text": str(content)}]

        bedrock_messages.append({
            "role": role,
            "content": bedrock_content
        })

    # Build Bedrock request
    bedrock_request = {
        "messages": bedrock_messages,
        "inferenceConfig": {
            "maxTokens": request_data.get("max_tokens", 4096),
            "temperature": request_data.get("temperature", 1.0),
            "topP": request_data.get("top_p", 1.0),
        }
    }

    # Add system prompt if present
    if system:
        if isinstance(system, str):
            bedrock_request["system"] = [{"text": system}]
        elif isinstance(system, list):
            bedrock_request["system"] = [{"text": s.get("text", str(s)) if isinstance(s, dict) else str(s)} for s in system]

    # Add stop sequences if present
    if "stop_sequences" in request_data:
        bedrock_request["inferenceConfig"]["stopSequences"] = request_data["stop_sequences"]

    # Handle tools
    if "tools" in request_data:
        bedrock_tools = []
        for tool in request_data["tools"]:
            bedrock_tools.append({
                "toolSpec": {
                    "name": tool.get("name", ""),
                    "description": tool.get("description", ""),
                    "inputSchema": {"json": tool.get("input_schema", {})}
                }
            })
        if bedrock_tools:
            bedrock_request["toolConfig"] = {"tools": bedrock_tools}

    return bedrock_request


def convert_from_bedrock_format(bedrock_response: dict, model: str) -> dict:
    """Convert Bedrock Converse API response to Anthropic API format."""
    output = bedrock_response.get("output", {})
    message = output.get("message", {})
    usage = bedrock_response.get("usage", {})

    # Convert content blocks
    content = []
    for block in message.get("content", []):
        if "text" in block:
            content.append({
                "type": "text",
                "text": block["text"]
            })
        elif "toolUse" in block:
            tool_use = block["toolUse"]
            content.append({
                "type": "tool_use",
                "id": tool_use.get("toolUseId", ""),
                "name": tool_use.get("name", ""),
                "input": tool_use.get("input", {})
            })

    # Determine stop reason
    stop_reason_map = {
        "end_turn": "end_turn",
        "tool_use": "tool_use",
        "max_tokens": "max_tokens",
        "stop_sequence": "stop_sequence"
    }
    stop_reason = stop_reason_map.get(
        bedrock_response.get("stopReason", "end_turn"),
        "end_turn"
    )

    return {
        "id": f"msg_{datetime.now().strftime('%Y%m%d%H%M%S%f')}",
        "type": "message",
        "role": "assistant",
        "model": model,
        "content": content,
        "stop_reason": stop_reason,
        "stop_sequence": None,
        "usage": {
            "input_tokens": usage.get("inputTokens", 0),
            "output_tokens": usage.get("outputTokens", 0)
        }
    }


async def stream_bedrock_response(
    bedrock_model: str,
    bedrock_request: dict,
    original_model: str
) -> AsyncGenerator[bytes, None]:
    """Stream response from Bedrock and convert to Anthropic SSE format."""

    try:
        response = bedrock_client.converse_stream(
            modelId=bedrock_model,
            **bedrock_request
        )

        # Send message_start event
        message_start = {
            "type": "message_start",
            "message": {
                "id": f"msg_{datetime.now().strftime('%Y%m%d%H%M%S%f')}",
                "type": "message",
                "role": "assistant",
                "model": original_model,
                "content": [],
                "stop_reason": None,
                "stop_sequence": None,
                "usage": {"input_tokens": 0, "output_tokens": 0}
            }
        }
        yield f"event: message_start\ndata: {json.dumps(message_start)}\n\n".encode()

        content_block_idx = 0
        current_block_type = None
        input_tokens = 0
        output_tokens = 0

        for event in response.get("stream", []):
            if "contentBlockStart" in event:
                block_start = event["contentBlockStart"]
                start_data = block_start.get("start", {})

                if "text" in start_data or not start_data:
                    current_block_type = "text"
                    block_event = {
                        "type": "content_block_start",
                        "index": content_block_idx,
                        "content_block": {"type": "text", "text": ""}
                    }
                elif "toolUse" in start_data:
                    current_block_type = "tool_use"
                    tool_use = start_data["toolUse"]
                    block_event = {
                        "type": "content_block_start",
                        "index": content_block_idx,
                        "content_block": {
                            "type": "tool_use",
                            "id": tool_use.get("toolUseId", ""),
                            "name": tool_use.get("name", ""),
                            "input": {}
                        }
                    }
                else:
                    current_block_type = "text"
                    block_event = {
                        "type": "content_block_start",
                        "index": content_block_idx,
                        "content_block": {"type": "text", "text": ""}
                    }

                yield f"event: content_block_start\ndata: {json.dumps(block_event)}\n\n".encode()

            elif "contentBlockDelta" in event:
                delta = event["contentBlockDelta"].get("delta", {})

                if "text" in delta:
                    delta_event = {
                        "type": "content_block_delta",
                        "index": content_block_idx,
                        "delta": {"type": "text_delta", "text": delta["text"]}
                    }
                    yield f"event: content_block_delta\ndata: {json.dumps(delta_event)}\n\n".encode()

                elif "toolUse" in delta:
                    tool_delta = delta["toolUse"]
                    if "input" in tool_delta:
                        delta_event = {
                            "type": "content_block_delta",
                            "index": content_block_idx,
                            "delta": {
                                "type": "input_json_delta",
                                "partial_json": tool_delta["input"]
                            }
                        }
                        yield f"event: content_block_delta\ndata: {json.dumps(delta_event)}\n\n".encode()

            elif "contentBlockStop" in event:
                stop_event = {
                    "type": "content_block_stop",
                    "index": content_block_idx
                }
                yield f"event: content_block_stop\ndata: {json.dumps(stop_event)}\n\n".encode()
                content_block_idx += 1

            elif "metadata" in event:
                metadata = event["metadata"]
                usage = metadata.get("usage", {})
                input_tokens = usage.get("inputTokens", 0)
                output_tokens = usage.get("outputTokens", 0)

            elif "messageStop" in event:
                pass  # Will be handled by message_delta

        # Send message_delta with final usage
        message_delta = {
            "type": "message_delta",
            "delta": {"stop_reason": "end_turn", "stop_sequence": None},
            "usage": {"output_tokens": output_tokens}
        }
        yield f"event: message_delta\ndata: {json.dumps(message_delta)}\n\n".encode()

        # Send message_stop
        yield f"event: message_stop\ndata: {json.dumps({'type': 'message_stop'})}\n\n".encode()

    except Exception as e:
        logger.error(f"Streaming error: {e}")
        error_event = {
            "type": "error",
            "error": {"type": "api_error", "message": str(e)}
        }
        yield f"event: error\ndata: {json.dumps(error_event)}\n\n".encode()


@app.get("/")
async def root():
    """Root endpoint with usage info."""
    return {
        "name": "Bedrock Anthropic Proxy",
        "version": "1.0.0",
        "description": "Transparent proxy for using Anthropic API clients with AWS Bedrock",
        "endpoints": {
            "/v1/messages": "POST - Anthropic Messages API (streaming & non-streaming)",
            "/v1/models": "GET - List available models",
            "/health": "GET - Health check"
        },
        "config": {
            "aws_region": AWS_REGION,
            "default_model": DEFAULT_MODEL,
            "port": PROXY_PORT
        },
        "usage": {
            "1": "Set ANTHROPIC_BASE_URL=http://localhost:8080",
            "2": "Set ANTHROPIC_API_KEY=dummy (or any value)",
            "3": "Use your favorite Anthropic-compatible client!"
        }
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    try:
        # Quick STS check to verify AWS credentials
        sts = boto3.client("sts", config=bedrock_config)
        identity = sts.get_caller_identity()
        return {
            "status": "healthy",
            "aws_account": identity.get("Account", "unknown"),
            "aws_region": AWS_REGION,
            "default_model": DEFAULT_MODEL
        }
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "error": str(e)}
        )


@app.get("/v1/models")
async def list_models():
    """List available models."""
    models = []
    for name, bedrock_id in MODEL_MAPPING.items():
        models.append({
            "id": name,
            "object": "model",
            "created": 1700000000,
            "owned_by": "anthropic",
            "bedrock_id": bedrock_id
        })
    return {"object": "list", "data": models}


@app.post("/v1/messages")
async def messages(request: Request):
    """
    Handle Anthropic Messages API requests.
    Supports both streaming and non-streaming responses.
    """
    try:
        request_data = await request.json()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {e}")

    # Get and map model
    original_model = request_data.get("model", "")
    bedrock_model = map_model(original_model)

    logger.info(f"Request: model={original_model} -> {bedrock_model}, stream={request_data.get('stream', False)}")

    # Convert request format
    try:
        bedrock_request = convert_to_bedrock_format(request_data)
    except Exception as e:
        logger.error(f"Format conversion error: {e}")
        raise HTTPException(status_code=400, detail=f"Request conversion failed: {e}")

    # Check if streaming
    if request_data.get("stream", False):
        return StreamingResponse(
            stream_bedrock_response(bedrock_model, bedrock_request, original_model),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )

    # Non-streaming response
    try:
        response = bedrock_client.converse(
            modelId=bedrock_model,
            **bedrock_request
        )

        anthropic_response = convert_from_bedrock_format(response, original_model)
        return JSONResponse(content=anthropic_response)

    except bedrock_client.exceptions.ValidationException as e:
        logger.error(f"Bedrock validation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except bedrock_client.exceptions.ThrottlingException as e:
        logger.error(f"Bedrock throttling: {e}")
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    except Exception as e:
        logger.error(f"Bedrock error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    print(f"""
╔══════════════════════════════════════════════════════════════════╗
║                   Bedrock Anthropic Proxy                        ║
╠══════════════════════════════════════════════════════════════════╣
║  Transparent proxy for Anthropic API → AWS Bedrock               ║
╠══════════════════════════════════════════════════════════════════╣
║  AWS Region:     {AWS_REGION:<46} ║
║  Default Model:  {DEFAULT_MODEL:<46} ║
║  Proxy Port:     {PROXY_PORT:<46} ║
╠══════════════════════════════════════════════════════════════════╣
║  Usage:                                                          ║
║    export ANTHROPIC_BASE_URL=http://localhost:{PROXY_PORT:<19} ║
║    export ANTHROPIC_API_KEY=dummy                                ║
║                                                                  ║
║  Then use any Anthropic-compatible client!                       ║
╚══════════════════════════════════════════════════════════════════╝
""")

    uvicorn.run(app, host="0.0.0.0", port=PROXY_PORT)
