import { buildSdkMetadata, SdkContent } from "./sdk-content";

const SDK_URL = "https://pay.agentlabs.cc/sdk";

export const metadata = buildSdkMetadata(SDK_URL);

export default function SdkPage() {
  return <SdkContent url={SDK_URL} />;
}
