# LocalPass system diagrams

## 1. End-to-end architecture

```mermaid
flowchart TD
    A["Connected preparation / curation"] --> B["Versioned Guatapé destination pack"]
    B --> C["HTTPS LocalPass PWA"]
    B --> D["LocalPass Node filesystem"]

    C --> E["Ordinary phone"]
    D --> F["ESP8266 SoftAP + captive portal"]
    F --> E

    E --> G["IndexedDB"]
    E --> H["Local retrieval"]
    E --> I["Rules + itinerary engine"]
    E --> J["Saved plans"]

    H --> K["Offline answer"]
    I --> K
    G --> K
```

## 2. Connectivity degradation model

```mermaid
flowchart LR
    A["Good internet"] --> B["PWA + cloud enhancement"]
    B --> C["Intermittent internet"]
    C --> D["PWA uses cached shell + IndexedDB pack"]
    D --> E["No mobile data"]
    E --> F["LocalPass Node distributes pack / essentials"]
    F --> G["Phone continues offline"]
```

## 3. Hardware/software boundary

```mermaid
flowchart LR
    subgraph NODE["LocalPass Node — ESP8266"]
        N1["Wi-Fi AP"]
        N2["Captive portal"]
        N3["pack.json"]
        N4["health endpoint"]
    end

    subgraph PHONE["LocalPass PWA — phone"]
        P1["Pack import"]
        P2["IndexedDB"]
        P3["Search"]
        P4["Intent parsing"]
        P5["Budget/time scoring"]
        P6["Itinerary"]
    end

    N3 --> P1
    P1 --> P2
    P2 --> P3
    P2 --> P5
    P4 --> P5
    P5 --> P6
```

## 4. Hackathon demo

```mermaid
sequenceDiagram
    participant J as Judge
    participant N as LocalPass Node
    participant P as Phone / PWA

    J->>N: Connect to LocalPass-Guatape
    N-->>J: Captive portal opens
    J->>N: Download Guatapé destination pack
    N-->>J: pack.json
    J->>P: Import local pack
    P-->>J: Pack stored in IndexedDB
    J->>N: Disconnect / power off node
    J->>P: "2 hours, COP 50k, local food + nature"
    P-->>J: Offline itinerary from local data
```

## 5. Future field architecture — not MVP

```mermaid
flowchart TD
    C["Occasional upstream sync"] --> N1["Node: bus terminal"]
    C --> N2["Node: tourism office"]
    C --> N3["Node: hostel / community venue"]

    N1 --> P1["Phones"]
    N2 --> P2["Phones"]
    N3 --> P3["Phones"]
```

Do not call the MVP a mesh network. Multiple independently synced nodes are roadmap scope.
