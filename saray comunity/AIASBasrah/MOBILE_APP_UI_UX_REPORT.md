# AIAS Basra Community Mobile Application

## UI, UX, and Navigation Improvement Report

**Scope:** Android mobile application only  
**Constraint:** No changes to backend logic, Firebase structures, Cloud Functions, security rules, permissions, or data contracts  
**Primary objective:** Make the application smoother, less cluttered, easier to learn, and more predictable while retaining every existing feature  
**Experience references:** Instagram for feed and creation simplicity; Reddit for spaces, discussion hierarchy, and voting

---

## 1. Executive summary

The mobile application already contains a substantial feature set: community feeds, spaces, voting, comments, projects, profiles, connections, notifications, messages, moderation, post creation, media, Arabic/English support, and administrative controls. The principal problem is not missing functionality. It is that too many features are presented with similar visual priority and several destinations use different interaction models.

The recommended redesign is therefore an information-architecture and presentation change—not a feature rewrite. The app should become feed-first, use five stable bottom destinations, place secondary features under their natural parent screens, and reveal advanced actions only when needed.

The proposed primary navigation is:

1. **Home** — main and connected feeds.
2. **Spaces** — discover, join, and manage communities.
3. **Create** — thought, question, or project composer.
4. **Messages** — inbox and space conversations.
5. **Profile** — identity, activity, settings, and account tools.

Every existing feature remains available. No backend-facing repository method or payload needs to change.

---

## 2. Current-state assessment

### 2.1 Strengths

- The product has a recognizable AIAS Basra visual identity.
- Burgundy, cream, and gold provide a distinctive community aesthetic.
- Core social features are already present and connected.
- Posts expose useful context: author, space, type, time, votes, and comments.
- The central Create action is easy to identify.
- Arabic and English experiences are supported.
- Space-based discussions create a useful Reddit-like community model.
- Voting, questions, projects, messages, moderation, and notifications are already integrated.

### 2.2 Primary usability problems

#### Too much content before the feed

The Home screen uses a large hero, quick composer, discovery controls, headings, counts, and filters before the first post. This makes the application feel like a promotional website rather than a frequently used mobile social application.

#### Competing navigation concepts

The app currently combines bottom destinations, manual screen state, full-screen dialogs, modal sheets, and nested return rules. This can make Back behavior and destination context difficult to predict.

#### Primary navigation does not reflect feature importance

The bottom bar gives a permanent position to Website while Messages is a core application feature. External website access should remain available, but it should not compete with daily community activity.

#### Filters overflow and create visual noise

Sort and post-type controls appear in one long horizontal region. On smaller screens and in Arabic, options are partially hidden and require sideways discovery.

#### Post cards are visually heavy

Space attribution, author metadata, type labels, title, content, images, project embeds, voting, comments, sharing, and moderation can all appear within one card. Too many borders and equally prominent controls slow scanning.

#### Too many modal interaction patterns

Post details, comments, member profiles, images, editing, sharing, moderation, space creation, and settings-related actions use a mixture of dialogs and bottom sheets. Large content and forms do not feel stable when presented as temporary overlays.

#### Global busy state interrupts the entire application

Some actions show a full-screen progress overlay. This makes small operations feel slower and prevents unrelated interaction.

#### Advanced management is too close to everyday use

Space administration, archived posts, connections, moderation, permanent message settings, and profile tools are important but should be progressively disclosed instead of competing with the main feed.

---

## 3. Design principles

The redesign should follow these rules:

1. **Content first:** show useful community content immediately.
2. **One obvious primary action per screen:** reduce decision load.
3. **Stable navigation:** the same action must always produce the same destination and Back behavior.
4. **Progressive disclosure:** display common actions; place rare and administrative actions in menus or secondary screens.
5. **Preserve context:** feeds retain scroll, filters, and selected space when users return.
6. **Local feedback:** loading and errors appear beside the affected content.
7. **Consistent components:** posts, spaces, members, menus, and empty states use shared patterns.
8. **Mobile-native behavior:** use routes for destinations, bottom sheets for short choices, and dialogs only for confirmation.
9. **RTL parity:** Arabic is treated as a first-class layout, not a mirrored afterthought.
10. **Backend isolation:** UI work must call the existing ViewModel and repository interfaces unchanged.

---

## 4. Proposed information architecture

### Primary navigation

| Destination | Main content | Secondary destinations |
|---|---|---|
| Home | Main feed, connected feed, selected projects | Post detail, comments, member profile, notifications, search |
| Spaces | Your spaces and Discover | Space detail, members, about, management, create space |
| Create | Thought, question, and project composer | Media picker, destination selector, discard confirmation |
| Messages | Conversation inbox | Space conversation, conversation information, media viewer |
| Profile | Profile and personal posts/projects | Edit profile, settings, connections, archived posts, managed spaces |

### Navigation hierarchy

```text
Application
├── Home
│   ├── Search
│   ├── Notifications
│   ├── Post detail
│   │   └── Comments
│   └── Member profile
├── Spaces
│   ├── Your spaces
│   ├── Discover
│   ├── Space detail
│   │   ├── Posts
│   │   ├── About
│   │   ├── Members
│   │   └── Messages
│   ├── Create space
│   └── Manage space
├── Create
│   ├── Thought
│   ├── Question
│   └── Project
├── Messages
│   ├── Inbox
│   └── Conversation
└── Profile
    ├── Posts
    ├── Projects
    ├── Spaces
    ├── Connections
    ├── Archived posts
    └── Settings
```

Website access remains available through Profile → Settings or an About section.

---

## 5. Screen-by-screen recommendations

### 5.1 Application shell

- Use a compact top app bar with contextual title and a maximum of two actions.
- Use proper Material icons rather than text symbols.
- Keep the five bottom destinations stable across primary screens.
- Hide the bottom bar only during immersive flows such as image viewing or focused creation.
- Preserve each tab's scroll position and local filters.
- Tapping an active tab should return to its root; tapping Home again should scroll to top.
- Use a route/navigation stack instead of manually encoding all return behavior.

### 5.2 Home

Recommended order:

1. Compact app bar with logo/title, search, and notification badge.
2. Small feed-context switcher: Main, Connected, Selected.
3. Collapsible filter row.
4. Feed content.

Changes:

- Remove the permanent large hero from returning-user Home.
- Show onboarding or community introduction only for first use or an empty feed.
- Remove the duplicate quick composer because Create is permanently accessible in the bottom navigation.
- Divide sorting and content type into separate compact controls.
- Keep pull-to-refresh available as recovery, while realtime listeners continue working normally.
- Keep visible content during refresh.

### 5.3 Post card

Recommended hierarchy:

1. Avatar, author, space, time, and overflow menu.
2. Subtle type label.
3. Title and body.
4. Media/project preview.
5. Vote, comment, and share actions.

Changes:

- Reduce borders and nested surfaces.
- Use “Read more” for long content.
- Keep space attribution in the author row rather than as a separate visual block.
- Place edit, delete, warn, and moderation actions inside the overflow menu.
- Use one compact vote control consistent across feed and detail screens.
- Make the comment area a large touch target.
- Avoid loading interactive WebViews inside every feed card; display the existing preview in a lighter card and open the full project route when selected. This is a UI rendering decision only and does not change stored project data.

### 5.4 Post detail and comments

- Replace the full-screen post dialog with a normal destination.
- Present the complete post at the top.
- Put the discussion below the post in the same scrolling screen.
- Keep the comment composer anchored above the keyboard.
- Use a small sheet for comment sorting or post sharing.
- Open edit flows as full screens or appropriately sized sheets.
- Reserve dialogs for destructive confirmations.
- Preserve current vote, comment, mention, permission, and moderation calls.

### 5.5 Spaces

- Start with two tabs: Your Spaces and Discover.
- Display space cards with image, name, slug, short description, privacy, and one primary action.
- Move popularity/new sorting to a small filter control.
- Open spaces as dedicated destinations.
- Space detail should use Posts, About, Members, and Messages tabs.
- Place administration under an overflow menu visible only to authorized users.
- Keep Create Space available from a clear button or floating action button on the Spaces screen.

### 5.6 Create post

- Keep Create as the elevated center destination.
- Begin with three clear types: Thought, Question, Project.
- Reveal only relevant fields for the chosen type.
- Use a destination selector for Main or a space.
- Keep Publish visible in the top app bar or above the keyboard.
- Show media upload state inside each media item.
- Preserve draft text locally during the current session.
- Confirm before discarding meaningful content.
- Navigate to the published post after success.

### 5.7 Messages

Inbox rows should contain:

- Space avatar and name.
- Latest message preview.
- Timestamp.
- Unread count.
- Permission state only when action is required.

Conversation changes:

- Use a compact fixed header.
- Group consecutive messages from the same sender.
- Add date separators.
- Keep the composer fixed above the keyboard.
- Combine image and voice actions behind one attachment affordance.
- Use long press or overflow for reactions, reply, edit, delete, and details.
- Move enablement, member access, and permanent-history information into Conversation Info.
- Preserve the current message, reaction, seen-receipt, media, and permission behavior.

### 5.8 Profile

- Present banner, avatar, identity, short bio, and statistics first.
- Use tabs for Posts, Projects, and Spaces.
- Keep Edit Profile as the primary profile action.
- Move Settings, Connections, Manage Spaces, Archived Posts, language, notifications, website, and sign out into the top-right menu or Settings.
- Continue using the existing private current-user profile and public member profile data.

### 5.9 Search

- Use one dedicated full-screen search destination.
- Categorize results into Posts, Spaces, and Members.
- Debounce typing and retain the current bounded data behavior.
- Store only recent search terms locally.
- Use clear loading, empty, and no-results states.
- Navigate to standard detail routes instead of adding another layer of dialogs.

### 5.10 Notifications

- Keep the notification badge in the Home top app bar.
- Use a full-height sheet or normal screen with grouped recent/earlier items.
- Make unread state visually clear but restrained.
- Route every notification through the same post, profile, space, archive, or conversation destinations used elsewhere.
- Preserve current native notification payload handling.

### 5.11 Settings and administration

- Group settings into Account, Experience, Notifications, Community Management, and About.
- Show management sections only to users with the corresponding existing permission.
- Use normal screens for complex management.
- Use confirmation dialogs only for destructive operations.
- Keep moderation reasons and existing approval rules unchanged.

---

## 6. Feature-preservation matrix

| Existing feature | New UI location | Backend change |
|---|---|---|
| Recommended/latest/popular feed | Home filter | None |
| Thought/question/project filter | Home filter sheet/chips | None |
| Main and connected feeds | Home context switcher | None |
| Selected projects | Home context or Profile projects | None |
| Voting | Post card and post detail | None |
| Comments/answers | Post detail | None |
| Post sharing | Post action sheet | None |
| Share to space chat | Share sheet | None |
| Post editing/deletion | Post overflow menu | None |
| Moderation | Authorized overflow actions | None |
| Image gallery | Post detail/media viewer | None |
| Behance/project preview | Lightweight preview and project detail | None |
| Mentions | Composer and rendered content | None |
| Space discovery | Spaces → Discover | None |
| Connections to spaces | Space card/detail | None |
| Create/manage spaces | Spaces actions/management | None |
| Private/view-only spaces | Space labels and existing permission states | None |
| Messages | Messages tab | None |
| Replies/reactions/seen state | Conversation menus and message UI | None |
| Voice/image messages | Attachment menu | None |
| Member profiles | Profile route/sheet | None |
| Personal connections | Profile → Connections | None |
| Archived posts/reposting | Profile → Archived Posts | None |
| Notifications | Home notification action | None |
| Language | Profile → Settings | None |
| Native notification settings | Profile → Settings | None |
| Website link | Profile → Settings/About | None |
| Authentication/profile completion | Profile tab onboarding | None |

---

## 7. Visual system recommendations

### Layout

- Adopt an 8dp spacing scale.
- Use 16dp standard horizontal page padding.
- Maintain at least 48dp interactive touch targets.
- Avoid multiple cards nested inside one another.
- Use dividers or spacing—not both—between most feed items.

### Typography

- Limit each screen to four functional levels: title, section heading, body, metadata.
- Reduce uppercase labels and wide tracking.
- Ensure Arabic line height accommodates diacritics and larger glyph forms.
- Respect system font scaling without clipping navigation labels.

### Color

- Retain burgundy as the primary action and identity color.
- Use gold sparingly for verification, highlights, or selected projects.
- Use neutral surfaces for most content.
- Ensure selected states are not communicated through color alone.

### Icons

- Replace character-based symbols with a consistent vector icon set.
- Every unlabeled icon requires an accessibility description.
- Use familiar conventions: home, communities, add, chat, person, search, notifications, overflow, share, and vote.

### Motion

- Use 150–250ms transitions.
- Animate tab and selected-chip changes subtly.
- Avoid large decorative animations during feed scrolling.
- Respect the system reduced-motion preference where available.

---

## 8. Loading, errors, and interaction feedback

- Replace the global busy overlay with per-action loading states.
- Use skeletons for initial feed, space, and message loading.
- Keep old content visible while refreshing.
- Disable only the button being submitted.
- Provide optimistic visual vote response while the existing function completes.
- Show inline retry actions for feed, comments, messages, and media.
- Use snackbars for completed actions, not for errors that require a decision.
- Keep form validation next to the relevant field.
- Ensure destructive actions state exactly what will happen.

---

## 9. Accessibility and localization requirements

- Full Arabic RTL and English LTR validation for every screen.
- Logical reading order for screen readers.
- Content descriptions for icons, avatars, verification status, media, and vote state.
- 48dp minimum touch areas.
- Text and control contrast meeting WCAG AA where practical.
- Support large font sizes without overlapping controls.
- Do not rely on gestures alone; provide visible alternatives.
- Announce loading, errors, publication success, vote state, and unread counts.
- Keep keyboard focus stable in search, comments, messages, and creation.

---

## 10. Implementation roadmap

### Phase 1 — Navigation foundation

- Introduce route-based navigation for primary and detail destinations.
- Build the five-destination bottom bar.
- Preserve state independently for each primary tab.
- Normalize Android Back behavior.
- Route notifications and deep links through the same destinations.

**Exit condition:** All current screens remain reachable and Back behavior is deterministic.

### Phase 2 — Shared design system

- Create shared app bars, navigation, cards, rows, tabs, menus, loading states, empty states, and error states.
- Replace text symbols with vector icons.
- Establish spacing, typography, color, elevation, and animation rules.
- Validate RTL foundations.

**Exit condition:** New screens can be built from reusable components without visual duplication.

### Phase 3 — Home, posts, and comments

- Simplify the Home hierarchy.
- Redesign post cards.
- Implement post detail as a route.
- Integrate comments into post detail.
- Consolidate share and advanced post actions.

**Exit condition:** Users reach content faster and can read, vote, comment, share, and moderate without feature loss.

### Phase 4 — Spaces and creation

- Separate Your Spaces and Discover.
- Build dedicated space detail tabs.
- Consolidate space management.
- Redesign the post composer with progressive fields.
- Improve local draft, keyboard, and media feedback.

**Exit condition:** Space discovery and posting are understandable without prior instruction.

### Phase 5 — Messages

- Redesign inbox rows.
- Redesign conversation header, message grouping, composer, reply, reactions, and attachments.
- Move administrative information into Conversation Info.

**Exit condition:** Messaging feels familiar while every existing message feature remains available.

### Phase 6 — Profile, settings, search, and notifications

- Simplify Profile and add activity tabs.
- Consolidate secondary destinations under Profile/Settings.
- Build categorized search.
- Normalize notification destinations and presentation.

**Exit condition:** Secondary features remain easy to locate without crowding primary screens.

### Phase 7 — Polish and release validation

- Validate small/large devices, English/Arabic, RTL/LTR, keyboard, rotation if supported, and accessibility.
- Test loading, empty, error, permission-denied, offline, and slow-network states.
- Verify scroll and tab-state restoration.
- Run unit tests, lint, accessibility review, and release build.

**Exit condition:** Complete feature parity and no backend-facing diff.

---

## 11. Backend protection boundary

The redesign must not change:

- Firebase project configuration or backend services.
- Firestore collections, documents, fields, queries, or listener logic.
- Cloud Function names, inputs, outputs, or authorization checks.
- Storage paths or upload behavior.
- Authentication or profile data contracts.
- Moderation and role permission behavior.
- Notification payload structures.
- Repository methods that perform backend operations.

Permitted changes:

- Compose layout and reusable components.
- Navigation routes and local presentation state.
- Local scroll, selection, expansion, and draft state.
- Which existing ViewModel action is exposed from which screen.
- Icons, typography, spacing, colors, animation, and accessibility metadata.
- Reorganization of existing features into clearer destinations.

---

## 12. Measurement plan

The redesign should be evaluated using product and usability outcomes, without requiring backend changes during implementation:

- Time from app open to first meaningful post interaction.
- Taps required to create a post.
- Taps required to open a space conversation.
- Percentage of users who can locate Messages, Settings, Connections, and Archived Posts without help.
- Navigation reversals or repeated Back presses.
- Post creation abandonment.
- Search result selection rate.
- Comment composer completion rate.
- Crash-free and ANR-free sessions.
- Qualitative Arabic and English usability feedback.

Target usability outcomes:

- Primary destinations accessible in one tap.
- Common secondary tasks accessible within two taps.
- First post visible near the initial viewport on normal returning-user Home.
- No horizontally clipped essential controls.
- No full-screen blocking loader for a single-item action.

---

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Feature loss during simplification | Maintain and test the feature-preservation matrix |
| Navigation rewrite breaks notification destinations | Define route tests for every notification type before replacing manual state |
| Arabic layouts become crowded | Design RTL variants alongside English, not after implementation |
| Users cannot find moved tools | Use familiar parent locations and concise labels; include temporary discovery hints if needed |
| Large all-at-once rewrite causes regressions | Deliver in phases while keeping ViewModel/backend interfaces stable |
| Scroll state is lost between tabs | Store list state per primary destination and per selected space |
| Administrative controls become too hidden | Show role-aware overflow menus and dedicated management entry points |

---

## 14. Acceptance criteria

The mobile UI/UX redesign is complete when:

- All existing features in the preservation matrix are reachable and operational.
- Bottom navigation contains Home, Spaces, Create, Messages, and Profile.
- Website access remains available as a secondary action.
- Home shows community content substantially earlier.
- Sort and type filters fit small English and Arabic screens without clipping essential choices.
- Posts use a consistent compact hierarchy.
- Post detail is a stable destination and comments are integrated naturally.
- Back navigation behaves consistently across posts, profiles, spaces, comments, settings, and messages.
- Each primary tab preserves its scroll and local state.
- Large forms are not presented inside small alert dialogs.
- Loading and failure feedback is localized.
- English, Arabic, RTL, font scaling, and screen-reader navigation are validated.
- Existing tests pass and a signed release build succeeds.
- Code review confirms no changes to backend logic or data contracts.

---

## 15. Recommendation

Proceed with the redesign in seven controlled phases, beginning with navigation and reusable components. Do not start by restyling every existing screen independently: a stable navigation model and component system will prevent duplicated work and inconsistent behavior.

The strongest product direction is a **feed-first social application with Reddit-like spaces**, not a mobile copy of the website. Instagram should inform simplicity, visual hierarchy, creation, and messaging; Reddit should inform communities, voting, discussion depth, and moderation. AIAS Basra's identity should remain visible through its colors, typography, and curated architectural content without allowing branding elements to delay access to the community itself.
