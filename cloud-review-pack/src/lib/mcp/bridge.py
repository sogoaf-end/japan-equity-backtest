import asyncio
import json
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


def normalize_tool_result(result):
    text_parts = []

    for item in result.content:
        if getattr(item, "type", None) == "text" and isinstance(getattr(item, "text", None), str):
            text_parts.append(item.text)

    text = "\n".join(text_parts).strip() or None

    return {
        "text": text,
        "data": result.structuredContent,
        "isError": bool(result.isError),
    }


async def execute(payload):
    server = StdioServerParameters(
        command=payload["command"],
        args=payload.get("args", []),
    )

    async with stdio_client(server) as (read, write):
        async with ClientSession(read, write) as session:
            initialize = await session.initialize()
            server_info = initialize.serverInfo.model_dump(exclude_none=True)
            action = payload["action"]

            if action == "tools":
                tools = await session.list_tools()
                return {
                    "serverInfo": server_info,
                    "tools": [tool.model_dump(exclude_none=True) for tool in tools.tools],
                }

            if action == "call_tool":
                result = await session.call_tool(
                    payload["name"], payload.get("arguments", {})
                )
                return {
                    "serverInfo": server_info,
                    "result": normalize_tool_result(result),
                }

            raise ValueError(f"Unsupported action: {action}")


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    payload = json.loads(sys.stdin.read())
    response = asyncio.run(execute(payload))
    print(json.dumps(response, ensure_ascii=False))


if __name__ == "__main__":
    main()