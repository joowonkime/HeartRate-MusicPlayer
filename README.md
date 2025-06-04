# Svelte + Vite

This template should help get you started developing with Svelte in Vite.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode).

## Need an official Svelte framework?

Check out [SvelteKit](https://github.com/sveltejs/kit#readme), which is also powered by Vite. Deploy anywhere with its serverless-first approach and adapt to various platforms, with out of the box support for TypeScript, SCSS, and Less, and easily-added support for mdsvex, GraphQL, PostCSS, Tailwind CSS, and more.

## Technical considerations

**Why use this over SvelteKit?**

```mermaid
graph TD
    A[Landing Page] --> B[User Taps Login]
    B --> C[Login Authentication System]
    C --> D{Authentication Success?}
    D -->|No| C
    D -->|Yes| E[System: Load User Profile]
    E --> F[Preference Settings Page]
    F --> G[User: Configure Preferences]
    G --> H[System: Save Preferences]
    H --> I[Home Player Page]
    
    %% Main App Flow
    I --> J[User: Taps 'Start Monitoring']
    J --> K[System: Request Heartbeat Sensor]
    K --> L[User: Attach Heartbeat Sensor]
    L --> M[System: Verify Sensor Connection]
    M --> N{Sensor Connected?}
    N -->|No| O[System: Show Error Message]
    O --> L
    N -->|Yes| P[System: Start Session]
    P --> Q[Music Playing Interface]
    
    %% Music Playing Flow
    Q --> R[System: Display Current Track]
    R --> S[User: Can Skip Songs]
    S --> T[System: Load Next Track]
    T --> U[User: Taps 'Next']
    U --> V[System: Update Song History]
    V --> T
    
    %% Session End Flow
    Q --> W[User: Taps 'Stop']
    W --> X[System: End Session]
    X --> Y[System: Generate BPM Graph]
    Y --> Z[System: Compile Song History]
    Z --> AA[Session Summary View]
    AA --> BB[User: Views BPM Graph]
    AA --> CC[User: Views Song History]
    
    %% Navigation to My Page
    I --> DD[User: Navigate to My Page]
    DD --> EE[My Page]
    EE --> FF[User: Access Song History]
    EE --> GG[User: Access Rating]
    FF --> HH[Song History Page]
    GG --> II[Rating Page]
    
    %% Styling
    classDef userAction fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    classDef systemAction fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef decision fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef page fill:#e8f5e8,stroke:#2e7d32,stroke-width:2px
    
    class B,G,J,L,S,U,W,BB,CC,DD,FF,GG userAction
    class C,E,H,K,M,P,R,T,V,X,Y,Z systemAction
    class D,N decision
    class A,F,I,Q,AA,EE,HH,II page
   ```