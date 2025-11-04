# Contributing to Documentation

Thank you for your interest in contributing to our documentation! This guide will help you get started.

## How to Contribute

### Reporting Issues

If you find a typo, broken link, or have suggestions for improvement:

1. Check if an issue already exists for the problem
2. If not, create a new issue describing:
   - What needs to be fixed or improved
   - Which page/document it relates to
   - Any relevant context

### Making Changes

#### 1. Fork and Clone

```bash
# Fork the repository on GitHub, then:
git clone https://github.com/YOUR_USERNAME/my-website.git
cd my-website
```

#### 2. Create a Branch

```bash
git checkout -b docs/your-change-description
```

#### 3. Set Up Development Environment

```bash
# Install dependencies
npm install

# Start the development server
npm start
```

The site will be available at `http://localhost:3000`. Changes are reflected automatically.

#### 4. Make Your Changes

- **Documentation**: Edit files in the `docs/` directory
- **Blog Posts**: Add new posts to the `blog/` directory
- **Configuration**: Modify `docusaurus.config.ts` for site-wide changes

#### 5. Preview Your Changes

- The development server automatically reloads when you save files
- Check that your changes look correct
- Verify all links work
- Test the documentation structure

#### 6. Commit and Push

```bash
git add .
git commit -m "docs: description of your changes"
git push origin docs/your-change-description
```

#### 7. Create a Pull Request

1. Go to your fork on GitHub
2. Click "New Pull Request"
3. Fill out the PR template with:
   - Description of changes
   - Which pages were modified
   - Any breaking changes (if applicable)
4. Submit the PR

## Documentation Standards

### Writing Style

- Use clear, concise language
- Write in the second person ("you") for instructions
- Use active voice when possible
- Keep sentences and paragraphs short

### Markdown Formatting

- Use proper heading hierarchy (H1 → H2 → H3)
- Add code blocks with syntax highlighting
- Use lists for multiple items
- Include examples when helpful

### File Organization

- Group related content in subdirectories
- Use descriptive filenames (lowercase, hyphens)
- Add frontmatter metadata:

```markdown
---
sidebar_position: 1
title: Your Page Title
description: A brief description
---
```

### Code Examples

- Include working, tested code examples
- Add comments explaining complex parts
- Use appropriate syntax highlighting
- Keep examples simple and focused

## Review Process

1. **Automated Checks**: GitHub Actions will run checks
2. **Community Review**: Maintainers and community members review PRs
3. **Feedback**: Address any requested changes
4. **Merge**: Once approved, your changes will be merged!

## Getting Help

- Check existing documentation first
- Ask questions in Discord (if available)
- Open a discussion for non-urgent questions
- Check existing issues and PRs

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers
- Provide constructive feedback
- Focus on what's best for the documentation

Thank you for contributing! 🎉

