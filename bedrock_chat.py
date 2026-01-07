#!/usr/bin/env python3
"""
Bedrock Chat - Claude Desktop Replacement

A full-featured chat interface that replicates Claude Desktop functionality
but uses AWS Bedrock as the backend and stores conversations locally.

Features:
- Local SQLite storage for all conversations
- Official Claude system prompt injection
- Conversation history sidebar
- Export/import conversations
- Multiple model support

Usage:
    # Set AWS credentials
    export AWS_REGION=us-east-1
    export AWS_PROFILE=your-profile

    # Run the chat UI
    streamlit run bedrock_chat.py
"""

import os
import json
from datetime import datetime

import boto3
from botocore.config import Config
import streamlit as st

from chat_storage import ChatStorage, get_storage
from system_prompt import get_system_prompt, get_minimal_system_prompt

# Configuration
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
USE_SYSTEM_PROMPT = os.getenv("USE_SYSTEM_PROMPT", "true").lower() == "true"

# Model options with friendly names
MODELS = {
    "Claude Opus 4": ("us.anthropic.claude-opus-4-20250514-v1:0", "opus"),
    "Claude Sonnet 4.5": ("global.anthropic.claude-sonnet-4-5-20250929-v1:0", "sonnet"),
    "Claude Sonnet 4": ("us.anthropic.claude-sonnet-4-20250514-v1:0", "sonnet"),
    "Claude Haiku 4.5": ("us.anthropic.claude-haiku-4-5-20251001-v1:0", "haiku"),
    "Claude 3.5 Sonnet": ("us.anthropic.claude-3-5-sonnet-20241022-v2:0", "sonnet"),
    "Claude 3.5 Haiku": ("us.anthropic.claude-3-5-haiku-20241022-v1:0", "haiku"),
    "Claude 3 Opus": ("us.anthropic.claude-3-opus-20240229-v1:0", "opus"),
}


@st.cache_resource
def get_bedrock_client():
    """Get cached Bedrock client."""
    config = Config(
        region_name=AWS_REGION,
        retries={"max_attempts": 3, "mode": "adaptive"}
    )
    return boto3.client("bedrock-runtime", config=config)


def convert_messages_to_bedrock(messages: list) -> list:
    """Convert chat messages to Bedrock Converse API format."""
    bedrock_messages = []
    for msg in messages:
        role = msg["role"]
        if role in ("user", "assistant"):
            bedrock_messages.append({
                "role": role,
                "content": [{"text": msg["content"]}]
            })
    return bedrock_messages


def stream_response(
    client,
    model_id: str,
    messages: list,
    system_prompt: str = "",
    max_tokens: int = 4096,
    temperature: float = 1.0
):
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


def init_session_state():
    """Initialize session state variables."""
    if "current_conversation_id" not in st.session_state:
        st.session_state.current_conversation_id = None
    if "messages" not in st.session_state:
        st.session_state.messages = []


def load_conversation(conv_id: str, storage: ChatStorage):
    """Load a conversation into session state."""
    st.session_state.current_conversation_id = conv_id
    messages = storage.get_messages(conv_id)
    st.session_state.messages = [
        {"role": msg.role, "content": msg.content}
        for msg in messages
    ]


def render_sidebar(storage: ChatStorage):
    """Render the sidebar with conversation list and settings."""
    with st.sidebar:
        st.title("Claude on Bedrock")

        # New chat button
        if st.button("+ New Chat", type="primary", use_container_width=True):
            st.session_state.current_conversation_id = None
            st.session_state.messages = []
            st.rerun()

        st.divider()

        # Model selection
        model_name = st.selectbox(
            "Model",
            options=list(MODELS.keys()),
            index=0,
            key="model_selector"
        )
        model_id, model_key = MODELS[model_name]

        # Parameters (collapsed by default)
        with st.expander("Parameters"):
            max_tokens = st.slider("Max Tokens", 256, 8192, 4096, key="max_tokens")
            temperature = st.slider("Temperature", 0.0, 1.0, 1.0, 0.1, key="temperature")

            use_system_prompt = st.checkbox(
                "Use Claude System Prompt",
                value=USE_SYSTEM_PROMPT,
                help="Inject the official Claude.ai system prompt for authentic behavior"
            )

            custom_system = st.text_area(
                "Custom System Prompt",
                placeholder="Override or add to the system prompt...",
                height=80,
                key="custom_system"
            )

        st.divider()

        # Conversation history
        st.subheader("Conversations")

        conversations = storage.list_conversations(limit=30)

        if not conversations:
            st.caption("No conversations yet")
        else:
            for conv in conversations:
                # Format the date
                try:
                    updated = datetime.fromisoformat(conv.updated_at)
                    date_str = updated.strftime("%b %d")
                except:
                    date_str = ""

                # Highlight current conversation
                is_current = conv.id == st.session_state.current_conversation_id

                col1, col2 = st.columns([5, 1])

                with col1:
                    if st.button(
                        f"{conv.title[:30]}..." if len(conv.title) > 30 else conv.title,
                        key=f"conv_{conv.id}",
                        use_container_width=True,
                        type="primary" if is_current else "secondary"
                    ):
                        load_conversation(conv.id, storage)
                        st.rerun()

                with col2:
                    if st.button("🗑", key=f"del_{conv.id}", help="Delete"):
                        storage.delete_conversation(conv.id)
                        if conv.id == st.session_state.current_conversation_id:
                            st.session_state.current_conversation_id = None
                            st.session_state.messages = []
                        st.rerun()

        st.divider()

        # Export/Import
        with st.expander("Export/Import"):
            if st.session_state.current_conversation_id:
                export_data = storage.export_conversation(
                    st.session_state.current_conversation_id
                )
                st.download_button(
                    "Export Current Chat",
                    data=json.dumps(export_data, indent=2),
                    file_name="conversation.json",
                    mime="application/json"
                )

            uploaded = st.file_uploader("Import Chat", type="json")
            if uploaded:
                try:
                    data = json.load(uploaded)
                    new_id = storage.import_conversation(data)
                    if new_id:
                        load_conversation(new_id, storage)
                        st.success("Imported!")
                        st.rerun()
                except Exception as e:
                    st.error(f"Import failed: {e}")

        # AWS Status
        st.divider()
        try:
            sts = boto3.client("sts")
            identity = sts.get_caller_identity()
            st.caption(f"AWS: {identity['Account']}")
            st.caption(f"Region: {AWS_REGION}")
        except Exception as e:
            st.error("AWS credentials not configured")

    return model_id, model_key


def main():
    st.set_page_config(
        page_title="Claude on Bedrock",
        page_icon="🤖",
        layout="wide",
        initial_sidebar_state="expanded"
    )

    # Custom CSS for cleaner look
    st.markdown("""
        <style>
        .stChatMessage {
            padding: 1rem;
        }
        .stButton button {
            text-align: left;
        }
        [data-testid="stSidebarContent"] {
            padding-top: 1rem;
        }
        </style>
    """, unsafe_allow_html=True)

    init_session_state()
    storage = get_storage()

    # Render sidebar and get settings
    model_id, model_key = render_sidebar(storage)

    # Get system prompt settings
    use_system_prompt = st.session_state.get("use_system_prompt", USE_SYSTEM_PROMPT)
    custom_system = st.session_state.get("custom_system", "")

    # Build the system prompt
    if use_system_prompt:
        system_prompt = get_system_prompt(model_key)
        if custom_system:
            system_prompt += f"\n\n{custom_system}"
    else:
        system_prompt = custom_system

    # Main chat area
    if not st.session_state.messages:
        # Welcome screen for new chat
        st.markdown("""
        ## Welcome to Claude on Bedrock

        This is a local Claude Desktop replacement that:
        - Uses **your AWS Bedrock account** for inference
        - Stores all conversations **locally** on your machine
        - Includes the **official Claude system prompt** for authentic behavior

        Start typing below to begin a conversation.
        """)

    # Display chat messages
    for message in st.session_state.messages:
        with st.chat_message(message["role"]):
            st.markdown(message["content"])

    # Chat input
    if prompt := st.chat_input("Message Claude..."):
        # Create new conversation if needed
        if not st.session_state.current_conversation_id:
            title = storage.generate_title_from_message(prompt)
            conv = storage.create_conversation(
                title=title,
                model=model_key,
                system_prompt=system_prompt if use_system_prompt else None
            )
            st.session_state.current_conversation_id = conv.id

        # Add user message
        st.session_state.messages.append({"role": "user", "content": prompt})
        storage.add_message(
            st.session_state.current_conversation_id,
            "user",
            prompt
        )

        # Display user message
        with st.chat_message("user"):
            st.markdown(prompt)

        # Generate response
        with st.chat_message("assistant"):
            client = get_bedrock_client()

            response_placeholder = st.empty()
            full_response = ""

            max_tokens = st.session_state.get("max_tokens", 4096)
            temperature = st.session_state.get("temperature", 1.0)

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

        # Save assistant response
        st.session_state.messages.append({"role": "assistant", "content": full_response})
        storage.add_message(
            st.session_state.current_conversation_id,
            "assistant",
            full_response
        )

        # Update conversation title if this is the first exchange
        if len(st.session_state.messages) == 2:
            storage.update_conversation(
                st.session_state.current_conversation_id,
                title=storage.generate_title_from_message(prompt)
            )


if __name__ == "__main__":
    main()
