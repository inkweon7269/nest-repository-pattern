import { Test, TestingModule } from '@nestjs/testing';
import { PostsFacade } from '@src/posts/posts.facade';
import { PostsService } from '@src/posts/service/posts.service';
import { PostsValidationService } from '@src/posts/service/posts-validation.service';
import { PostResponseDto } from '@src/posts/dto/response/post.response.dto';
import { Post } from '@src/posts/entities/post.entity';
import { CreatePostRequestDto } from '@src/posts/dto/request/create-post.request.dto';
import { PaginationRequestDto } from '@src/common/dto/request/pagination.request.dto';
import { PaginatedResponseDto } from '@src/common/dto/response/paginated.response.dto';

describe('PostsFacade', () => {
  let facade: PostsFacade;
  let mockService: jest.Mocked<PostsService>;
  let mockValidationService: jest.Mocked<PostsValidationService>;

  const now = new Date();

  const mockPost: Post = {
    id: 1,
    title: 'Test Title',
    content: 'Test Content',
    isPublished: false,
    createdAt: now,
    updatedAt: now,
  };

  beforeEach(async () => {
    mockService = {
      findById: jest.fn(),
      findAllPaginated: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<PostsService>;

    mockValidationService = {
      validatePostExists: jest.fn(),
    } as unknown as jest.Mocked<PostsValidationService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsFacade,
        { provide: PostsService, useValue: mockService },
        { provide: PostsValidationService, useValue: mockValidationService },
      ],
    }).compile();

    facade = module.get<PostsFacade>(PostsFacade);
  });

  describe('getPostById', () => {
    it('should return a PostResponseDto when post exists', async () => {
      mockValidationService.validatePostExists.mockResolvedValue(mockPost);

      const result = await facade.getPostById(1);

      expect(mockValidationService.validatePostExists).toHaveBeenCalledWith(1);
      expect(result).toBeInstanceOf(PostResponseDto);
      expect(result.id).toBe(mockPost.id);
      expect(result.title).toBe(mockPost.title);
    });
  });

  describe('findAllPaginated', () => {
    it('should return PaginatedResponseDto with PostResponseDto items', async () => {
      const mockPost2: Post = {
        ...mockPost,
        id: 2,
        title: 'Second Post',
      };
      mockService.findAllPaginated.mockResolvedValue([
        [mockPost, mockPost2],
        2,
      ]);

      const paginationDto = new PaginationRequestDto();
      paginationDto.page = 1;
      paginationDto.limit = 10;

      const result = await facade.findAllPaginated(paginationDto);

      expect(mockService.findAllPaginated).toHaveBeenCalledWith(0, 10);
      expect(result).toBeInstanceOf(PaginatedResponseDto);
      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toBeInstanceOf(PostResponseDto);
      expect(result.items[0].id).toBe(mockPost.id);
      expect(result.items[1].id).toBe(mockPost2.id);
    });

    it('should pass correct skip and take values', async () => {
      mockService.findAllPaginated.mockResolvedValue([[], 0]);

      const paginationDto = new PaginationRequestDto();
      paginationDto.page = 3;
      paginationDto.limit = 5;

      await facade.findAllPaginated(paginationDto);

      expect(mockService.findAllPaginated).toHaveBeenCalledWith(10, 5);
    });

    it('should return correct meta information', async () => {
      mockService.findAllPaginated.mockResolvedValue([[mockPost], 15]);

      const paginationDto = new PaginationRequestDto();
      paginationDto.page = 2;
      paginationDto.limit = 5;

      const result = await facade.findAllPaginated(paginationDto);

      expect(result.meta.page).toBe(2);
      expect(result.meta.limit).toBe(5);
      expect(result.meta.totalElements).toBe(15);
      expect(result.meta.totalPages).toBe(3);
      expect(result.meta.isFirst).toBe(false);
      expect(result.meta.isLast).toBe(false);
    });

    it('should return empty items when no posts exist', async () => {
      mockService.findAllPaginated.mockResolvedValue([[], 0]);

      const paginationDto = new PaginationRequestDto();

      const result = await facade.findAllPaginated(paginationDto);

      expect(result.items).toEqual([]);
      expect(result.meta.totalElements).toBe(0);
    });
  });

  describe('createPost', () => {
    it('should return a PostResponseDto after creation', async () => {
      const dto: CreatePostRequestDto = {
        title: 'New Post',
        content: 'New Content',
      };
      mockService.create.mockResolvedValue(mockPost);

      const result = await facade.createPost(dto);

      expect(mockService.create).toHaveBeenCalledWith(dto);
      expect(result).toBeInstanceOf(PostResponseDto);
      expect(result.id).toBe(mockPost.id);
    });
  });

  describe('updatePost', () => {
    it('should return PostResponseDto when post exists', async () => {
      const dto = { title: 'Updated Title' };
      const updatedPost: Post = { ...mockPost, title: 'Updated Title' };
      mockValidationService.validatePostExists.mockResolvedValue(mockPost);
      mockService.update.mockResolvedValue(updatedPost);

      const result = await facade.updatePost(1, dto);

      expect(mockValidationService.validatePostExists).toHaveBeenCalledWith(1);
      expect(mockService.update).toHaveBeenCalledWith(1, dto);
      expect(result).toBeInstanceOf(PostResponseDto);
      expect(result.id).toBe(mockPost.id);
      expect(result.title).toBe('Updated Title');
    });
  });

  describe('deletePost', () => {
    it('should call delete when post exists', async () => {
      mockValidationService.validatePostExists.mockResolvedValue(mockPost);
      mockService.delete.mockResolvedValue(undefined);

      await facade.deletePost(1);

      expect(mockValidationService.validatePostExists).toHaveBeenCalledWith(1);
      expect(mockService.delete).toHaveBeenCalledWith(1);
    });
  });
});
