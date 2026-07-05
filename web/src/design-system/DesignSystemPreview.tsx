import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  ButtonGroup,
  Card,
  Checkbox,
  Dialog,
  Dropdown,
  EmptyState,
  Heading,
  Input,
  Logo,
  PageContainer,
  Radio,
  Section,
  Select,
  Skeleton,
  Tabs,
  Textarea,
  Tooltip,
} from "./index";
import "./preview.css";

const copy = {
  logo: "VAKA OS",
  title: "Design system foundation",
  intro: "An isolated development preview. These primitives do not replace existing product components yet.",
  actions: "Actions",
  primary: "Create workspace",
  secondary: "Book a demo",
  destructive: "Delete draft",
  tooltip: "Opens a secure VAKA workspace",
  forms: "Form controls",
  company: "Company name",
  companyHint: "Use the registered business name.",
  companyPlaceholder: "Mbare Trading",
  description: "Business description",
  descriptionPlaceholder: "Tell us what the business does",
  language: "Workspace language",
  english: "English",
  shona: "ChiShona",
  ndebele: "isiNdebele",
  updates: "Email updates",
  updatesDescription: "Receive important workspace and security notices.",
  option: "Primary workspace",
  states: "Status and feedback",
  secure: "Secure by design",
  secureBody: "Permissions and tenant boundaries remain mandatory at every layer.",
  menu: "Workspace menu",
  profile: "Profile",
  settings: "Settings",
  tabs: "Example views",
  overview: "Overview",
  activity: "Activity",
  overviewBody: "A calm executive summary belongs here.",
  activityBody: "Audit-aware activity belongs here.",
  emptyTitle: "No customers yet",
  emptyBody: "Create the first customer when this workflow is connected.",
  emptyAction: "Add customer",
  modalTitle: "Confirm foundation",
  modalDescription: "This preview demonstrates native dialog behaviour and keyboard focus.",
  modalBody: "The application modules have not been redesigned.",
  close: "Close dialog",
  cancel: "Cancel",
  confirm: "Confirm",
  theme: "Switch theme",
};

export function DesignSystemPreview() {
  const [dark, setDark] = useState(false);
  const [open, setOpen] = useState(false);

  return (
    <main className="vds-preview" data-vaka-theme={dark ? "dark" : "light"}>
      <PageContainer>
        <header className="vds-preview-header">
          <Logo ariaLabel={copy.logo} />
          <Button variant="secondary" size="sm" onClick={() => setDark((value) => !value)}>{copy.theme}</Button>
        </header>
        <Heading level={1} size="h1">{copy.title}</Heading>
        <p className="vds-preview-intro">{copy.intro}</p>

        <Section>
          <Heading level={2} size="h3">{copy.actions}</Heading>
          <ButtonGroup className="vds-preview-row">
            <Tooltip content={copy.tooltip}><Button>{copy.primary}</Button></Tooltip>
            <Button variant="secondary">{copy.secondary}</Button>
            <Button variant="ghost" onClick={() => setOpen(true)}>{copy.modalTitle}</Button>
            <Button variant="danger">{copy.destructive}</Button>
            <Button loading>{copy.primary}</Button>
          </ButtonGroup>
        </Section>

        <Section tone="subtle">
          <Heading level={2} size="h3">{copy.forms}</Heading>
          <div className="vds-preview-grid">
            <Input label={copy.company} hint={copy.companyHint} placeholder={copy.companyPlaceholder} />
            <Select label={copy.language} defaultValue="en">
              <option value="en">{copy.english}</option>
              <option value="sn">{copy.shona}</option>
              <option value="nd">{copy.ndebele}</option>
            </Select>
            <Textarea label={copy.description} placeholder={copy.descriptionPlaceholder} />
            <div className="vds-preview-choices">
              <Checkbox label={copy.updates} description={copy.updatesDescription} />
              <Radio name="workspace" label={copy.option} defaultChecked />
            </div>
          </div>
        </Section>

        <Section>
          <Heading level={2} size="h3">{copy.states}</Heading>
          <div className="vds-preview-stack">
            <ButtonGroup>
              <Badge>{copy.overview}</Badge>
              <Badge tone="success">{copy.secure}</Badge>
              <Badge tone="warning">{copy.activity}</Badge>
              <Badge tone="info">VAKA AI · Preview</Badge>
            </ButtonGroup>
            <Alert tone="success" title={copy.secure}>{copy.secureBody}</Alert>
            <Dropdown label={copy.menu}>
              <button type="button">{copy.profile}</button>
              <button type="button">{copy.settings}</button>
            </Dropdown>
            <Tabs
              ariaLabel={copy.tabs}
              items={[
                { id: "overview", label: copy.overview, content: copy.overviewBody },
                { id: "activity", label: copy.activity, content: copy.activityBody },
              ]}
            />
          </div>
        </Section>

        <Section tone="subtle">
          <div className="vds-preview-grid">
            <Card elevation="sm">
              <EmptyState
                title={copy.emptyTitle}
                description={copy.emptyBody}
                actions={<Button size="sm">{copy.emptyAction}</Button>}
              />
            </Card>
            <Card>
              <div className="vds-preview-stack">
                <Skeleton />
                <Skeleton />
                <Skeleton variant="block" />
              </div>
            </Card>
          </div>
        </Section>
      </PageContainer>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={copy.modalTitle}
        description={copy.modalDescription}
        closeLabel={copy.close}
        footer={
          <ButtonGroup>
            <Button variant="secondary" onClick={() => setOpen(false)}>{copy.cancel}</Button>
            <Button onClick={() => setOpen(false)}>{copy.confirm}</Button>
          </ButtonGroup>
        }
      >
        <p>{copy.modalBody}</p>
      </Dialog>
    </main>
  );
}
