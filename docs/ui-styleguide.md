# UI/UX STYLEGUIDE — NEO-BRUTALISM

A interface deve ser estritamente desenvolvida usando o estilo Neo-Brutalismo.
Ignore convenções de Material Design ou Flat Design suave.

## 1. Tipografia — agressiva e grande

- Use fontes sans-serif pesadas e de forte impacto, como Archivo Black, Space
  Grotesk, Roboto Mono ou Montserrat em peso 800/900.
- Títulos e cabeçalhos devem ser predominantemente em letras maiúsculas.
- Mantenha textos operacionais legíveis em telas pequenas.

## 2. Cores — contraste brutal

- Alterne fundos entre branco puro `#FFFFFF`, preto absoluto `#000000` e cores
  sólidas pastéis ou vibrantes.
- Acentos: verde neon `#B8FF29`, laranja `#FF8B2C`, roxo `#B288FF` e rosa
  `#FF2C85`.
- Gradientes são proibidos. Use apenas cores sólidas.

## 3. Bordas — grossas e visíveis

- Botões, cards, inputs e divisões devem usar borda preta sólida.
- Padrão:

```css
border: 3px solid #000000;
```

- Use `4px` quando for necessário aumentar a ênfase.

## 4. Sombras — duras e sem desfoque

- Sombras suaves ou com blur são proibidas.
- Padrão para botões e cards:

```css
box-shadow: 6px 6px 0 0 #000000;
```

- No hover ou estado pressionado:

```css
transform: translate(2px, 2px);
box-shadow: 4px 4px 0 0 #000000;
```

- O estado `:active` deve reforçar a sensação de clique físico.

## 5. Layout e elementos — estrutura em blocos

- Use cards e contêineres com cantos retos ou `border-radius` de no máximo `4px`.
- Separe seções com linhas pretas grossas, como:

```css
border-bottom: 3px solid #000000;
```

- A composição pode lembrar jornal impresso antigo ou quadrinhos.
- Use tags e badges com fundo colorido, texto preto e borda preta.
- Preserve hierarquia, respiro e leitura rápida apesar do estilo agressivo.

## 6. Regras operacionais

- O PDV deve priorizar uso com uma mão e alvos de toque grandes.
- Não dependa apenas de cor para comunicar estado ou erro.
- Todo controle deve ter foco de teclado visível.
- Respeite `prefers-reduced-motion`.
- Anúncios nunca podem parecer botões nem ficar próximos de finalizar venda,
  exportar backup ou cobrar cliente.
- Não use bibliotecas visuais que imponham Material Design.

