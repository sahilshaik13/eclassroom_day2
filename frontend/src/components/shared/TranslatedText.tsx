import { useDbTranslate } from '@/hooks/useDbTranslate'

type Props = {
  value: string | null | undefined
  as?: 'span' | 'p' | 'div' | 'h1' | 'h2' | 'h3' | 'h4' | 'strong'
  className?: string
  title?: string
}

/** Renders database-sourced text, auto-translated to Arabic when that language is active. */
export function TranslatedText({
  value,
  as: Tag = 'span',
  className,
  title,
}: Props) {
  const { text, isTranslating } = useDbTranslate(value)

  return (
    <Tag
      className={className}
      title={title}
      style={isTranslating ? { opacity: 0.7 } : undefined}
    >
      {text}
    </Tag>
  )
}
