# coursework-delivery Specification

## Purpose
Concluir os requisitos funcionais e registrar as entregas acadêmicas na arquitetura existente, mediante adaptação solicitada pelo usuário.

## Requirements

### Requirement: Python progress and hybrid search
The system SHALL calculate task completion percentage without division by zero and search authorized subjects by normalized name OR overdue incomplete tasks.

#### Scenario: Empty subject
- **WHEN** a subject has no non-cancelled tasks
- **THEN** progress returns a JSON object with percentage equal to zero.

#### Scenario: Name or overdue match
- **WHEN** a search contains a name and the overdue flag
- **THEN** it returns the union of name matches and subjects with overdue tasks, restricted to the authenticated account.

### Requirement: Authenticated REST subjects
The system SHALL expose GET, POST, PATCH and DELETE subject operations with ownership and optimistic revision validation.

#### Scenario: Foreign subject
- **WHEN** an authenticated user requests another account's subject
- **THEN** the request is rejected without disclosing or modifying that subject.

### Requirement: Python PDF report
The system SHALL generate a PDF from the authenticated account's authorized snapshot and return a protected download URL.

#### Scenario: Download report
- **WHEN** an authenticated user downloads a report
- **THEN** the response contains a valid PDF with subject names and task completion percentages.

### Requirement: Honest separate deliverables
The delivery SHALL contain sixteen separate responses documenting actual results, technology adaptations, and unverified requirements.

#### Scenario: Platform-specific evidence
- **WHEN** the original task asks for Xano or FlutterFlow evidence
- **THEN** the response identifies the actual equivalent implementation and does not claim those platforms were used.
