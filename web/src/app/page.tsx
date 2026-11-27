import { buildSdkMetadata, SdkContent } from "./sdk/sdk-content";

const ROOT_URL = "https://pay.agentlabs.cc/";

export const metadata = buildSdkMetadata(ROOT_URL);

// The product landing is the home page (Den, 2026-11-27): the root serves
// the same Pay by AgentLabs SDK page as /sdk, from the single shared
// component in app/sdk/sdk-content.tsx. The hosted checkout lives at /pay.
export default function HomePage() {
  return <SdkContent url={ROOT_URL} />;
}
