#!/usr/bin/env python3
"""
Bedrock Chat UI

A simple Streamlit chat interface that connects directly to AWS Bedrock.
Provides a Claude Desktop-like experience using your own AWS account.

Usage:
    # Set AWS credentials
    export AWS_REGION=us-east-1
    export AWS_PROFILE=your-profile  # or use env vars

    # Run the chat UI
    streamlit run bedrock_chat.py
"""

import os
import json
from datetime import datetime

import boto3
from botocore.config import Config
import streamlit as st

# Configuration
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
DEFAULT_MODEL = os.getenv("BEDROCK_MODEL", "us.anthropic.claude-opus-4-20250514-v1:0")

# Model options
MODELS = {
    "Claude Opus 4": "us.anthropic.claude-opus-4-20250514-v1:0",
    "Claude Sonnet 4.5": "global.anthropic.claude-sonnet-4-5-20250929-v1:0",
    "Claude Sonnet 4": "us.anthropic.claude-sonnet-4-20250514-v1:0",
    "Claude Haiku 4.5": "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    "Claude 3.5 Sonnet": "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
    "Claude 3.5 Haiku": "us.anthropic.claude-3-5-haiku-20241022-v1:0",
    "Claude 3 Opus": "us.anthropic.claude-3-opus-20240229-v1:0",
}

# Initialize Bedrock client
@st.cache_resource
def get_bedrock_client():
    config = Config(
        region_name=AWS_REGION,
        retries={"max_attempts": 3, "mode": "adaptive"}
    )
    return boto3.client("bedrock-runtime", config=config)


def convert_messages_to_bedrock(messages: list) -> list:
    """Convert chat messages to Bedrock format."""
    bedrock_messages = []
    for msg in messages:
        role = msg["role"]
        if role == "user":
            bedrock_messages.append({
                "role": "user",
                "content": [{"text": msg["content"]}]
            })
        elif role == "assistant":
            bedrock_messages.append({
                "role": "assistant",
                "content": [{"text": msg["content"]}]
            })
    return bedrock_messages


def stream_response(client, model_id: str, messages: list, system_prompt: str = "", max_tokens: int = 4096, temperature: float = 1.0):
    """Stream a response from Bedrock."""
    bedrock_messages = convert_messages_to_bedrock(messages)

    request_params = {
        "modelId": model_id,
        "messages": bedrock_messages,
        "inferenceConfig": {
            "maxTokens": max_tokens,
            "temperature": temperature,
        }
    }

    if system_prompt:
        request_params["system"] = [{"text": system_prompt}]

    try:
        response = client.converse_stream(**request_params)

        for event in response.get("stream", []):
            if "contentBlockDelta" in event:
                delta = event["contentBlockDelta"].get("delta", {})
                if "text" in delta:
                    yield delta["text"]

    except Exception as e:
        yield f"\n\n**Error:** {str(e)}"


def main():
    st.set_page_config(
        page_title="Bedrock Chat",
        page_icon="🤖",
        layout="wide"
    )

    st.title("🤖 Bedrock Chat")
    st.caption("Chat with Claude models on AWS Bedrock")

    # Sidebar for settings
    with st.sidebar:
        st.header("Settings")

        # Model selection
        model_name = st.selectbox(
            "Model",
            options=list(MODELS.keys()),
            index=0
        )
        model_id = MODELS[model_name]

        # Parameters
        max_tokens = st.slider("Max Tokens", 256, 8192, 4096)
        temperature = st.slider("Temperature", 0.0, 1.0, 1.0, 0.1)

        # System prompt
        system_prompt = st.text_area(
            "System Prompt",
            placeholder="Optional: Set a system prompt...",
            height=100
        )

        st.divider()

        # Clear chat button
        if st.button("Clear Chat", type="secondary"):
            st.session_state.messages = []
            st.rerun()

        st.divider()

        # Info
        st.caption(f"Region: {AWS_REGION}")
        st.caption(f"Model ID: {model_id}")

        # Check credentials
        try:
            sts = boto3.client("sts")
            identity = sts.get_caller_identity()
            st.success(f"AWS Account: {identity['Account']}")
        except Exception as e:
            st.error(f"AWS credentials error: {e}")

    # Initialize chat history
    if "messages" not in st.session_state:
        st.session_state.messages = []

    # Display chat messages
    for message in st.session_state.messages:
        with st.chat_message(message["role"]):
            st.markdown(message["content"])

    # Chat input
    if prompt := st.chat_input("Type your message..."):
        # Add user message to history
        st.session_state.messages.append({"role": "user", "content": prompt})

        # Display user message
        with st.chat_message("user"):
            st.markdown(prompt)

        # Generate response
        with st.chat_message("assistant"):
            client = get_bedrock_client()

            response_placeholder = st.empty()
            full_response = ""

            for chunk in stream_response(
                client,
                model_id,
                st.session_state.messages,
                system_prompt=system_prompt,
                max_tokens=max_tokens,
                temperature=temperature
            ):
                full_response += chunk
                response_placeholder.markdown(full_response + "▌")

            response_placeholder.markdown(full_response)

        # Add assistant response to history
        st.session_state.messages.append({"role": "assistant", "content": full_response})


if __name__ == "__main__":
    main()
