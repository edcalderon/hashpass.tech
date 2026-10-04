# Commercial and network diagrams

## Product family

```mermaid
flowchart TD
    LP[LocalPass Platform]
    LP --> NODE[LocalPass Node<br/>fixed venue infrastructure]
    LP --> GUIDE[LocalPass Guide<br/>wearable dynamic QR]
    LP --> DEST[LocalPass Destination<br/>packs + admin + analytics]
    LP --> TRUST[Trust Registry<br/>OpenProof + approved issuers]
```

## Physical-to-digital network

```mermaid
flowchart LR
    subgraph Physical
      N[Venue Node]
      G[Guide Badge]
      Q[Printed/basic QR]
    end
    Physical -->|scan / local Wi-Fi| P[Traveler phone]
    P --> L[LocalPass destination experience]
    L --> B[Local businesses]
    L --> A[Attractions]
    L --> T[Transport]
    L --> E[Essential information]
```

## Trust layers

```mermaid
flowchart TD
    U[LocalPass user] --> V[Verified identity/profile]
    V --> C[Professional credential]
    C --> I[Approved issuer]
    I --> O[OpenProof]
    I --> M[Municipality / tourism authority]
    I --> P[Approved partner organization]
```

OpenProof is an initial issuer/infrastructure option, not a protocol monopoly.

## Commercial flywheel

```mermaid
flowchart TD
    F[Free QR + traveler access] --> A[More guides and venues join]
    A --> V[More verified local information]
    V --> X[Better traveler experience]
    X --> S[More useful scans and discovery]
    S --> R[Operator rewards + measurable value]
    R --> H[More hardware / sponsor demand]
    H --> A
```

## B2B destination economics

```mermaid
flowchart LR
    D[Destination sponsor] -->|deployment contract| LP[LocalPass]
    LP -->|Nodes + Guides + packs| O[Local operators]
    O -->|local knowledge| LP
    TR[Travelers] -->|usage + feedback| LP
    LP -->|destination analytics| D
    LP -->|discovery| O
```
