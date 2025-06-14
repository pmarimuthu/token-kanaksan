import React, { useEffect, useRef, useState } from "react";
import FingerprintJS from "@fingerprintjs/fingerprintjs";

const API_BASE_URL = "http://localhost:8080/api/identities";

function DeviceId() {
  const [identity, setIdentity] = useState(null);
  const [status, setStatus] = useState("init");
  const [error, setError] = useState("");
  const abortControllerRef = useRef(null);

  useEffect(() => {
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    const processDevice = async () => {
      try {
        setStatus("init");

        // 1. Get or generate device ID
        let deviceId = localStorage.getItem("deviceId");
        if (!deviceId) {
          setStatus("generating");
          const fp = await FingerprintJS.load();
          const { visitorId } = await fp.get();
          deviceId = visitorId;
          localStorage.setItem("deviceId", deviceId);
        }

        // 2. Check existence (with abort signal)
        setStatus("checking");
        const existsRes = await fetch(
          `${API_BASE_URL}/device-exists/${encodeURIComponent(deviceId)}`,
          { signal }
        );

        if (signal.aborted) return;
        if (!existsRes.ok)
          throw new Error(`HTTP error! status: ${existsRes.status}`);

        const exists = await existsRes.json();

        // 3. Handle based on existence
        if (exists) {
          setStatus("fetching");
          const identityRes = await fetch(
            `${API_BASE_URL}/device/${encodeURIComponent(deviceId)}`,
            { signal }
          );

          if (signal.aborted) return;
          if (!identityRes.ok) throw new Error("Failed to fetch identity");

          setIdentity(await identityRes.json());
          setStatus("success");
        } else {
          setStatus("creating");
          const createRes = await fetch(`${API_BASE_URL}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deviceId }),
            signal,
          });

          if (signal.aborted) return;
          if (!createRes.ok) {
            const errorData = await createRes.json().catch(() => ({}));
            throw new Error(errorData.message || "Creation failed");
          }

          setIdentity(await createRes.json());
          setStatus("success");
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Device processing error:", err);
          setError(err.message);
          setStatus("error");
        }
      }
    };

    processDevice();

    return () => {
      // Cleanup: abort ongoing requests on unmount
      abortControllerRef.current.abort();
    };
  }, []);

  // Render states
  return (
    <div>
      {status === "init" && <p>Initializing device...</p>}
      {status === "checking" && <p>Checking device registration...</p>}
      {status === "creating" && <p>Creating new identity...</p>}

      {status === "error" && (
        <div className="error">
          <p>Error: {error}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      )}

      {status === "success" && identity && <div>{identity.deviceId}</div>}
    </div>
  );
}

export default DeviceId;
