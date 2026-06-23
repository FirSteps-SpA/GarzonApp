import { z } from 'zod'

// Esquema de validación para crear/editar un ítem de la carta.
// El precio se ingresa como texto en la UI; lo coercionamos a número.
export const itemSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
  descripcion: z.string().trim().optional(),
  categoriaId: z.string().min(1, 'Elegí una categoría'),
  precio: z.coerce
    .number({ invalid_type_error: 'El precio debe ser un número' })
    .min(0, 'El precio no puede ser negativo'),
  fotoUrl: z
    .string()
    .trim()
    .url('Debe ser una URL válida')
    .optional()
    .or(z.literal('')),
  disponible: z.boolean(),
})

export type ItemFormValues = z.infer<typeof itemSchema>

// Esquema para crear/editar una categoría.
export const categoriaSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
  parentId: z.string().nullable(),
  orden: z.coerce.number({ invalid_type_error: 'El orden debe ser un número' }).int().min(0),
})

export type CategoriaFormValues = z.infer<typeof categoriaSchema>

// Esquema para crear un garzón (se usará en el sub-checkpoint C).
export const garzonSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio'),
  email: z.string().trim().email('Email inválido'),
  codigoGarzon: z
    .string()
    .trim()
    .regex(/^\d{2}$/, 'El código debe ser de 2 dígitos'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
})

export type GarzonFormValues = z.infer<typeof garzonSchema>
