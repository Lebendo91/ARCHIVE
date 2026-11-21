import { Download, Inbox, Plus, Search, Settings, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Input,
  KeyCombo,
  Skeleton,
  Spinner,
  Tooltip,
} from '@/components/ui';
import { toast } from '@/stores/toasts';

function GallerySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xs font-semibold tracking-label text-fg-secondary uppercase">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Development-only gallery of the design system (route /dev/ui, absent from production builds). It shows
 * every component in every state for visual review (specification §20).
 */
export function UiGalleryPage() {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="flex flex-col gap-10 pb-16">
      <GallerySection title="Boutons">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" icon={Download}>
            Importer un document
          </Button>
          <Button variant="secondary" icon={Plus}>
            Nouvelle note
          </Button>
          <Button variant="ghost">Annuler</Button>
          <Button variant="danger" icon={Trash2}>
            Supprimer
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" size="sm">
            Petit
          </Button>
          <Button variant="primary" size="md">
            Moyen
          </Button>
          <Button variant="primary" size="lg" icon={Download}>
            Grand
          </Button>
          <Button variant="primary" loading>
            Enregistrement
          </Button>
          <Button variant="secondary" loading>
            Chargement
          </Button>
          <Button variant="primary" disabled>
            Désactivé
          </Button>
          <Button variant="secondary" disabled>
            Désactivé
          </Button>
          <Button variant="danger" disabled>
            Désactivé
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <IconButton icon={Settings} label="Paramètres" />
          <IconButton
            icon={Search}
            label="Rechercher"
            variant="secondary"
            shortcut={['Ctrl', 'K']}
          />
          <IconButton icon={Trash2} label="Supprimer" size="sm" />
          <IconButton icon={Plus} label="Ajouter" size="lg" />
          <IconButton icon={Plus} label="Indisponible" disabled />
        </div>
      </GallerySection>

      <GallerySection title="Champs">
        <div className="grid max-w-3xl grid-cols-2 gap-6">
          <Input label="Nom de l’espace de travail" placeholder="Ex. Électronique" />
          <Input
            label="Recherche"
            icon={Search}
            placeholder="Rechercher…"
            hint="Recherche dans les titres."
          />
          <Input label="Adresse" defaultValue="valeur invalide" error="Ce champ est obligatoire." />
          <Input label="Désactivé" defaultValue="Lecture seule" disabled />
        </div>
      </GallerySection>

      <GallerySection title="Cartes et badges">
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader
              icon={Inbox}
              iconTone="brand"
              title="Titre de carte"
              description="Description secondaire de la carte."
              actions={<Badge tone="brand">Accent</Badge>}
            />
          </Card>
          <Card className="flex flex-wrap gap-2">
            <Badge>Neutre</Badge>
            <Badge tone="info">Information</Badge>
            <Badge tone="success">Succès</Badge>
            <Badge tone="warning">Avertissement</Badge>
            <Badge tone="danger">Erreur</Badge>
            <Badge tone="intelligence">Intelligence</Badge>
            <Badge tone="relations">Relations</Badge>
            <KeyCombo keys={['Ctrl', 'Maj', 'N']} />
          </Card>
        </div>
      </GallerySection>

      <GallerySection title="Chargement">
        <div className="flex items-center gap-6">
          <Spinner size={16} label="Chargement" />
          <Spinner size={24} className="text-amber" />
          <div className="flex w-80 flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      </GallerySection>

      <GallerySection title="Fenêtres, menus, infobulles, notifications">
        <div className="flex flex-wrap items-center gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button>Ouvrir une fenêtre</Button>
            </DialogTrigger>
            <DialogContent
              title="Renommer le document"
              description="Le nom d’origine du fichier est conservé dans les métadonnées."
              footer={<Button variant="primary">Enregistrer</Button>}
            >
              <Input label="Titre affiché" defaultValue="Cours NE555" />
            </DialogContent>
          </Dialog>
          <Button
            variant="danger"
            onClick={() => {
              setConfirmOpen(true);
            }}
          >
            Confirmation destructive
          </Button>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="Supprimer ce document ?"
            description="La copie gérée par ARCHIVE sera supprimée. Le fichier d’origine sur votre disque n’est pas touché."
            confirmLabel="Supprimer"
            onConfirm={() => {
              setConfirmOpen(false);
            }}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>Ouvrir un menu</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem icon={Plus} shortcut={['Ctrl', 'N']}>
                Nouvelle note
              </DropdownMenuItem>
              <DropdownMenuItem icon={Download}>Importer</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={Trash2} disabled>
                Indisponible
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Tooltip content="Infobulle avec raccourci" shortcut={['Ctrl', ',']}>
            <Button variant="ghost">Survoler</Button>
          </Tooltip>
          <Button
            onClick={() => toast.success('Document importé', { description: 'cours-ne555.pdf' })}
          >
            Succès
          </Button>
          <Button
            onClick={() => toast.error('Import impossible', { description: 'Fichier illisible.' })}
          >
            Erreur
          </Button>
          <Button onClick={() => toast.warning('Espace disque faible')}>Avertissement</Button>
          <Button onClick={() => toast.info('Indexation terminée')}>Information</Button>
        </div>
      </GallerySection>

      <GallerySection title="État vide">
        <Card>
          <EmptyState
            icon={Inbox}
            title="Aucun résultat"
            description="Essayez d’autres termes ou retirez un filtre."
            headingLevel={3}
            actions={<Button variant="primary">Action principale</Button>}
          />
        </Card>
      </GallerySection>
    </div>
  );
}
