import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button, Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import { useI18n } from '@/i18n';

function Sample({ children }: { children: ReactNode }) {
  return (
    <svg width="28" height="20" viewBox="-14 -10 28 20" aria-hidden="true" className="shrink-0">
      {children}
    </svg>
  );
}

function Line({ tone, dash, width = 1.5 }: { tone: string; dash?: string; width?: number }) {
  return (
    <Sample>
      <path
        d="M-12,0L12,0"
        stroke="currentColor"
        strokeWidth={width}
        strokeDasharray={dash}
        className={tone}
      />
    </Sample>
  );
}

function Entry({ sample, label }: { sample: ReactNode; label: string }) {
  return (
    <li className="flex items-center gap-3 text-sm text-fg">
      {sample}
      {label}
    </li>
  );
}

/** What the shapes and the lines of the map mean: the colour is never the only cue. */
export function GraphLegend() {
  const { t } = useI18n();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" icon={Info}>
          {t('graph.map.legend')}
        </Button>
      </PopoverTrigger>
      <PopoverContent label={t('graph.map.legend')} side="top" align="end" className="w-72">
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2">
            <h3 className="text-2xs font-semibold tracking-label text-fg-secondary uppercase">
              {t('graph.legend.items')}
            </h3>
            <ul className="flex flex-col gap-1.5">
              <Entry
                sample={
                  <Sample>
                    <rect
                      x="-7"
                      y="-7"
                      width="14"
                      height="14"
                      rx="2"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className="fill-graphite text-fg-secondary"
                    />
                  </Sample>
                }
                label={t('graph.kindsPlural.document')}
              />
              <Entry
                sample={
                  <Sample>
                    <circle
                      r="7"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className="fill-graphite text-amber"
                    />
                  </Sample>
                }
                label={t('graph.kindsPlural.note')}
              />
              <Entry
                sample={
                  <Sample>
                    <rect
                      x="-8"
                      y="-8"
                      width="16"
                      height="16"
                      rx="4"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className="fill-graphite text-fg-secondary"
                    />
                  </Sample>
                }
                label={t('graph.kindsPlural.workspace')}
              />
              <Entry
                sample={
                  <Sample>
                    <path
                      d="M0,-7L7,0L0,7L-7,0Z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className="fill-graphite text-fg-secondary"
                    />
                  </Sample>
                }
                label={t('graph.kindsPlural.tag')}
              />
              <Entry
                sample={
                  <Sample>
                    <circle
                      r="7"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeDasharray="3 2"
                      className="fill-graphite text-fg-secondary"
                    />
                  </Sample>
                }
                label={t('graph.legend.archived')}
              />
            </ul>
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="text-2xs font-semibold tracking-label text-fg-secondary uppercase">
              {t('graph.legend.links')}
            </h3>
            <ul className="flex flex-col gap-1.5">
              <Entry
                sample={<Line tone="text-purple" width={1.25} />}
                label={t('graph.legend.link')}
              />
              <Entry
                sample={<Line tone="text-purple" width={2} />}
                label={t('graph.legend.relation')}
              />
              <Entry
                sample={<Line tone="text-cyan" dash="5 4" />}
                label={t('graph.legend.suggestion')}
              />
              <Entry
                sample={<Line tone="text-fg-muted" width={1.25} />}
                label={t('graph.legend.organisation')}
              />
            </ul>
            <p className="text-xs text-fg-secondary">{t('graph.legend.arrow')}</p>
          </section>
        </div>
      </PopoverContent>
    </Popover>
  );
}
