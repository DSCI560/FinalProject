# Milestone 1 Slides Outline

## Slide 1: Project Overview

**Title:** AI Cohort Assistant  
**Subtitle:** Technical Milestone 1

Include:

- one-sentence problem statement,
- one-sentence solution statement,
- team member names and lead roles.

## Slide 2: Problem and Value

Include:

- scattered communication across chats and files,
- repeated questions and mentor dependency,
- value of a domain-specific AI assistant in group chat.

## Slide 3: Team Organization

Include:

- Harsh as Tech Lead,
- Bhargav as Business Lead,
- Nishkarsh as Product Lead,
- note that all members contribute to both technical and business work.

You can paste this diagram:

```mermaid
flowchart TD
    A["AI Cohort Assistant Team"] --> B["Harsh<br/>Tech Lead"]
    A --> C["Bhargav<br/>Business Lead"]
    A --> D["Nishkarsh<br/>Product Lead"]
```

## Slide 4: Technical Architecture

Include the MVP flow:

```mermaid
flowchart LR
    U["User"] --> W["Web App"]
    W --> C["Group Chat"]
    W --> F["File Upload"]
    F --> E["Embeddings / Vector Store"]
    C --> R["Retrieval Layer"]
    R --> L["LLM"]
    L --> C
```

## Slide 5: Business Architecture and Roadmap

Include:

- target users,
- pricing tier idea,
- milestone roadmap from Milestone 1 to Milestone 4,
- Milestone 1 completion target of about 30%.

## Presenter note

If you need to keep this very short, Slides 4 and 5 can also be used as the final summary during the video instead of a separate presentation.
