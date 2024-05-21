import "./App.css";
import { ConfigProvider, theme } from "antd";
import { Chat } from "./pages/chat/chat";

export function App() {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
      }}
    >
      <Chat />
    </ConfigProvider>
  );
}

export default App;
